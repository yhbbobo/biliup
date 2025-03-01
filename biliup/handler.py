import copy
import json
import logging
import os
import shutil
import subprocess
import time
from functools import reduce
from pathlib import Path
from typing import List

from biliup.config import config
from .app import event_manager, context
from .common.tools import NamedLock
from .downloader import download, send_upload_event
from .engine.event import Event
from .engine.upload import UploadBase
from .uploader import upload, fmt_title_and_desc
from biliup.database import DB

CHECK = 'check'
PRE_DOWNLOAD = 'pre_download'
DOWNLOAD = 'download'
DOWNLOADED = 'downloaded'
UPLOAD = 'upload'
UPLOADED = 'uploaded'
logger = logging.getLogger('biliup')


@event_manager.register(CHECK, block='Asynchronous1')
def singleton_check(platform, name, url):
    from .plugins.twitch import Twitch
    if platform == Twitch:
        # 如果支持批量检测，目前只有一个支持，第一版先写死按照特例处理
        for turl in Twitch.batch_check.__func__(Twitch.url_list):
            yield Event(PRE_DOWNLOAD, args=(name, turl,))
        return
    if context['PluginInfo'].url_status[url] == 1:
        logger.info(f'{url}-{url}-正在下载中，跳过检测')
        return
    # 可能对同一个url同时发送两次上传事件
    with NamedLock(f"upload_count_{url}"):
        # from .handler import event_manager, UPLOAD
        # += 不是原子操作
        context['url_upload_count'].setdefault(url, 0)
        context['url_upload_count'][url] += 1
        yield Event(UPLOAD, ({'name': name, 'url': url},))
    if platform(name, url).check_stream(True):
        # 需要等待上传文件列表检索完成后才可以开始下次下载
        with NamedLock(f'upload_file_list_{name}'):
            context['PluginInfo'].url_status[url] = 1
            yield Event(PRE_DOWNLOAD, args=(name, url,))


@event_manager.register(PRE_DOWNLOAD, block='Asynchronous1')
def pre_processor(name, url):
    logger.info(f'{name}-{url}-开播了准备下载')
    preprocessor = config['streamers'].get(name, {}).get('preprocessor')
    if preprocessor:
        processor(preprocessor, json.dumps({
            "name": name,
            "url": url,
            "start_time": int(time.time())
        }, ensure_ascii=False))
    yield Event(DOWNLOAD, (name, url))

@event_manager.register(DOWNLOAD, block='Asynchronous1')
def process(name, url):
    stream_info = {
        'name': name,
        'url': url,
    }
    url_status = context['PluginInfo'].url_status
    # 下载开始
    try:
        kwargs: dict = config['streamers'][name].copy()
        kwargs.pop('url')
        suffix = kwargs.get('format')
        if suffix:
            kwargs['suffix'] = suffix
        stream_info = download(name, url, **kwargs)
    except Exception as e:
        logger.exception(f"下载错误: {stream_info['name']} - {e}")
    finally:
        # 下载结束
        # 永远不可能有两个同url的下载线程
        # 可能对同一个url同时发送两次上传事件
        with NamedLock(f"upload_count_{stream_info['url']}"):
            # += 不是原子操作
            context['url_upload_count'][stream_info['url']] += 1
            yield Event(DOWNLOADED, (stream_info,))
        url_status[url] = 0

@event_manager.register(DOWNLOADED, block='Asynchronous1')
def processed(stream_info):
    name = stream_info['name']
    # 下载后处理 上传前处理
    downloaded_processor = config['streamers'].get(name, {}).get('downloaded_processor')
    if downloaded_processor:
        default_date = time.localtime()
        file_list = UploadBase.file_list(name)
        processor(downloaded_processor, json.dumps({
            "name": name,
            "url": stream_info.get('url'),
            "room_title": stream_info.get('title', name),
            "start_time": int(time.mktime(stream_info.get('date', default_date))),
            "end_time": int(time.mktime(stream_info.get('end_time', default_date))),
            "file_list": [file.video for file in file_list]
        }, ensure_ascii=False))
        # 后处理完成后重新扫描文件列表
    yield Event(UPLOAD, (stream_info,))


@event_manager.register(UPLOAD, block='Asynchronous2')
def process_upload(stream_info):
    url = stream_info['url']
    name = stream_info['name']
    url_upload_count = context['url_upload_count']
    # 上传开始
    try:
        file_list = UploadBase.file_list(name)
        if len(file_list) <= 0:
            logger.debug("无需上传")
            return
        if ("title" not in stream_info) or (not stream_info["title"]):  # 如果 data 中不存在标题, 说明下载信息已丢失, 则尝试从数据库获取
            data, _ = fmt_title_and_desc({
                **DB.get_stream_info_by_filename(os.path.splitext(file_list[0].video)[0]),
                "name": name})  # 如果 restart, data 中会缺失 name 项
            stream_info.update(data)
        filelist = upload(stream_info)
        if filelist:
            yield Event(UPLOADED, (name, stream_info.get('live_cover_path'), filelist))
    except Exception:
        logger.exception(f"上传错误: {name}")
    finally:
        # 上传结束
        # 有可能有两个同url的上传线程 保证计数正确
        with NamedLock(f'upload_count_{url}'):
            url_upload_count[url] -= 1

@event_manager.register(UPLOADED, block='Asynchronous2')
def uploaded(name, live_cover_path, data: List):
    # data = file_list
    post_processor = config['streamers'].get(name, {}).get("postprocessor", None)
    if post_processor is None:
        # 删除封面
        if live_cover_path is not None:
            UploadBase.remove_file(live_cover_path)
        return UploadBase.remove_filelist(data)

    file_list = []
    for i in data:
        file_list.append(i.video)
        if i.danmaku is not None:
            file_list.append(i.danmaku)

    for post_processor in post_processor:
        if post_processor == 'rm':
            # 删除封面
            if live_cover_path is not None:
                UploadBase.remove_file(live_cover_path)
            UploadBase.remove_filelist(data)
            continue
        if post_processor.get('mv'):
            for file in file_list:
                path = Path(file)
                dest = Path(post_processor['mv'])
                if not dest.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.move(path, dest / path.name)
                except Exception as e:
                    logger.exception(e)
                    continue
                logger.info(f"move to {(dest / path.name).absolute()}")
        if post_processor.get('run'):
            try:
                process_output = subprocess.check_output(
                    post_processor['run'], shell=True,
                    input=reduce(lambda x, y: x + str(Path(y).absolute()) + '\n', file_list, ''),
                    stderr=subprocess.STDOUT, text=True)
                logger.info(process_output.rstrip())
            except subprocess.CalledProcessError as e:
                logger.exception(e.output)
                continue


def processor(processors, data):
    for processor in processors:
        if processor.get('run'):
            try:
                process_output = subprocess.check_output(
                    processor['run'], shell=True,
                    input=data,
                    stderr=subprocess.STDOUT, text=True)
                logger.info(process_output.rstrip())
            except subprocess.CalledProcessError as e:
                logger.exception(e.output)
                continue
