'use client'
import './globals.css'
import {Layout as SeLayout} from "@douyinfe/semi-ui/lib/es/layout";
import {usePathname, useRouter} from "next/navigation";
import styles from "./page.module.css";
import {SetStateAction, useCallback, useMemo, useState} from "react";
import Link from "next/link";
import {
    IconCloudStroked, IconCustomerSupport,
    IconDoubleChevronLeft,
    IconDoubleChevronRight,
    IconMoon,
    IconSemiLogo, IconStar,
    IconSun,
    IconVideoListStroked
} from "@douyinfe/semi-icons";
import {Button, Nav} from "@douyinfe/semi-ui";
import {OnSelectedData} from "@douyinfe/semi-ui/lib/es/navigation";


export default function RootLayout({children,}: { children: React.ReactNode }) {
    const {Sider} = SeLayout;
    const pathname = usePathname();
    let initOpenKeys: any = [];
    if (pathname.slice(1) === 'streamers' || pathname.slice(1) === 'history') {
        initOpenKeys = ['manager'];
    }

    const [openKeys, setOpenKeys] = useState(initOpenKeys);
    const [selectedKeys, setSelectedKeys] = useState<any>([pathname.slice(1)]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mode, setMode] = useState('light');
    let navStyle = isCollapsed ? {height: '100%', overflow: 'visible'} : {height: '100%'};

    const items = useMemo(() => [
        {
            itemKey: 'manager', text: '录播管理',
            items: [{itemKey: 'streamers', text: '直播管理'}, {itemKey: 'history', text: '历史记录'}],
            icon: <div style={{
                backgroundColor: '#5ac262ff',
                borderRadius: 'var(--semi-border-radius-medium)',
                color: 'var(--semi-color-bg-0)',
                display: 'flex',
                // justifyContent: 'center',
                padding: '4px'
            }}><IconVideoListStroked size='small'/></div>
        },
        {
            itemKey: 'upload-manager', text: '投稿管理', icon: <div style={{
                backgroundColor: '#885bd2ff',
                borderRadius: 'var(--semi-border-radius-medium)',
                color: 'var(--semi-color-bg-0)',
                display: 'flex',
                padding: '4px'
            }}><IconCloudStroked size='small'/></div>
        },
        {
            itemKey: 'dashboard', text: '空间配置', icon: <div style={{
                backgroundColor: '#6b6c75ff',
                borderRadius: 'var(--semi-border-radius-medium)',
                color: 'var(--semi-color-bg-0)',
                display: 'flex',
                padding: '4px'
            }}><IconStar size='small'/></div>
        },
        {itemKey: 'job', text: '直播历史', icon: <div style={{
                backgroundColor: 'rgb(250 102 76)',
                borderRadius: 'var(--semi-border-radius-medium)',
                color: 'var(--semi-color-bg-0)',
                display: 'flex',
                padding: '4px'
            }}><IconCustomerSupport size='small'/></div>},
        // {
        //     text: '任务平台',
        //     icon: <IconSetting/>,
        //     itemKey: 'Job',
        //     items: [{itemKey: 'About', text: '任务管理'}, {itemKey: 'Dashboard', text: '用户任务查询'}],
        // },
    ].map((value: any) => {
        value.text = <div style={{
            color: selectedKeys.some((key: string) => value.itemKey === key) || (selectedKeys.some((key: string) => openKeys.some((o: string | number) => isSub(key, o))) && openKeys.some((key: any) => value.itemKey === key)) ? 'var(--semi-color-text-0)' : 'var(--semi-color-text-2)',
            fontWeight: 600
        }}>{value.text}</div>
        return value;
    }), [openKeys, selectedKeys]);
    const renderWrapper = useCallback(({itemElement, isSubNav, isInSubNav, props}: any) => {
        const routerMap: Record<string, string> = {
            home: "/",
            history: "/history",
            dashboard: "/dashboard",
            streamers: "/streamers",
            "upload-manager": "/upload-manager",
            job: "/job",
        };
        if (!routerMap[props.itemKey]) {
            return itemElement;
        }
        return (
            <Link
                style={{textDecoration: "none", fontWeight: "600 !important"}}
                href={routerMap[props.itemKey]}
            >
                {itemElement}
            </Link>
        );
        // return itemElement;
    }, []);

    const onSelect = (data: OnSelectedData) => {
        setSelectedKeys([...data.selectedKeys]);
    };
    const onOpenChange = (data: any) => {
        setOpenKeys([...data.openKeys]);
    };
    const onCollapseChange = useCallback(() => {
        setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);
    return (
        <html lang="en">
        <body style={{width: '100%'}}>
        <SeLayout className="components-layout-demo semi-light-scrollbar">
            <Sider>
                <Nav
                    style={navStyle}
                    // toggleIconPosition={'left'}
                    // defaultOpenKeys={['job']}
                    openKeys={openKeys}
                    selectedKeys={selectedKeys}
                    isCollapsed={isCollapsed}
                    // bodyStyle={{height: '100%'}}
                    renderWrapper={renderWrapper}
                    items={items}
                    // onCollapseChange={onCollapseChange}
                    onOpenChange={onOpenChange}
                    onSelect={onSelect}
                    // header={{
                    //     logo: <IconSemiLogo style={{height: '36px', fontSize: 36}}/>,
                    //     text: 'BILIUP'
                    // }}
                    // footer={{
                    //     collapseButton: true,
                    // }}
                >
                    <Nav.Header
                        logo={<IconSemiLogo style={{height: '36px', fontSize: 36}}/>}
                        style={{justifyContent: 'flex-start'}}
                        text='BILIUP'
                    >
                        <div
                            style={{flexGrow: 1, display: 'flex', flexDirection: 'row-reverse', alignSelf: 'flex-end'}}>
                            <Button
                                onClick={onCollapseChange} type="tertiary"
                                className={styles.shadow} theme='borderless'
                                icon={isCollapsed
                                    ? <IconDoubleChevronRight/> : <IconDoubleChevronLeft/>}
                            />
                        </div>
                    </Nav.Header>
                    {footer(mode, setMode)}
                </Nav>
            </Sider>
            <SeLayout style={{height: '100vh'}}>
                {children}
            </SeLayout>
        </SeLayout>
        </body>
        </html>
    )
}

function footer(mode: string, setMode: {
    (value: SetStateAction<string>): void;
    (arg0: string): void;
}) {
    const switchMode = () => {
        const body = document.body;
        if (body.hasAttribute('theme-mode')) {
            body.removeAttribute('theme-mode');
            setMode('light');
        } else {
            body.setAttribute('theme-mode', 'dark');
            setMode('dark');
        }
    };
    return (
        <Nav.Footer collapseButton={true}>
            <Button
                onClick={switchMode}
                theme="borderless"
                icon=
                    {mode === 'light'
                        ? <IconMoon size="large"/>
                        : <IconSun size="large"/>
                    }
                style={{
                    color: 'var(--semi-color-text-2)',
                    // marginRight: '12px',
                }}/>
        </Nav.Footer>);
}

function isSub(key1: string, key2: string | number) {
    const routerMap: any = {
        manager: ["streamers", "history"],
    };
    return routerMap[key2]?.includes(key1);
}