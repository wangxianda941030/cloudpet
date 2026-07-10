"use client";

import { useEffect, useMemo, useState } from "react";

type Metric = {
  meta: { hostname: string; os: string; uptime: number; updatedAt: string };
  cpu: { usage: number; cores: number; load: number[] };
  memory: { total: number; used: number; percent: number };
  disk: { total: number; used: number; percent: number };
  network: { rx: number; tx: number; connections: number };
  containers: Array<{ name: string; state: string }>;
  databases: Array<{ name: string; type: string; status: string; port?: string; path?: string; source?: string; tables?: Array<{ name: string; columns: Array<{ name: string; type: string; primary: boolean }> }> }>;
  projects: Array<{ name: string; path: string; type: string; framework: string; manifests: string[]; files: Array<{ path: string; kind: "file" | "folder"; size?: number }> }>;
  inventory: { scanRoots: string[]; refreshSeconds: number; readOnly: boolean; fileContents: boolean };
};

const demo: Metric = {
  meta: { hostname: "ubuntu-tencent-01", os: "Ubuntu 24.04 LTS", uptime: 1283400, updatedAt: new Date().toISOString() },
  cpu: { usage: 23.8, cores: 4, load: [0.72, 0.61, 0.58] },
  memory: { total: 8 * 1024 ** 3, used: 4.1 * 1024 ** 3, percent: 51.2 },
  disk: { total: 80 * 1024 ** 3, used: 36.2 * 1024 ** 3, percent: 45.3 },
  network: { rx: 3.8 * 1024 ** 2, tx: 1.2 * 1024 ** 2, connections: 128 },
  containers: [{ name: "blog-web", state: "running" }, { name: "mysql", state: "running" }, { name: "redis", state: "running" }],
  databases: [{ name: "app.sqlite", type: "SQLite", status: "只读", path: "/var/www/cloudpet/data/app.sqlite", tables: [{ name: "servers", columns: [{ name: "id", type: "INTEGER", primary: true }, { name: "name", type: "TEXT", primary: false }, { name: "host", type: "TEXT", primary: false }] }, { name: "alerts", columns: [{ name: "id", type: "INTEGER", primary: true }, { name: "level", type: "TEXT", primary: false }] }] }, { name: "redis", type: "Redis 7", status: "运行中", port: "6379", tables: [] }],
  projects: [{ name: "cloudpet", path: "/var/www/cloudpet", type: "Node.js", framework: "Next.js", manifests: ["package.json"], files: [{ path: "app", kind: "folder" }, { path: "collector", kind: "folder" }, { path: "app/page.tsx", kind: "file", size: 12400 }, { path: "package.json", kind: "file", size: 980 }] }],
  inventory: { scanRoots: ["/var/www", "/srv", "/opt", "/home"], refreshSeconds: 60, readOnly: true, fileContents: false },
};

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const fileSize = (n = 0) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const uptime = (seconds: number) => `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小时`;

function Meter({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  return <div className="meter"><div><span>{label}</span><b>{value.toFixed(0)}%</b></div><div className="meter-track"><i className={tone} style={{ width: `${Math.min(100, value)}%` }} /></div><small>{detail}</small></div>;
}

export default function Home() {
  const [data, setData] = useState<Metric>(demo);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"closed" | "stats" | "explore" | "setup">("closed");
  const [copied, setCopied] = useState("");
  const [widgetMode, setWidgetMode] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWidgetMode(new URLSearchParams(window.location.search).has("widget")));
    let mounted = true;
    const load = async () => {
      try {
        const token = new URLSearchParams(window.location.search).get("token");
        const response = await fetch(`/api/metrics${token ? `?token=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("offline");
        const next = await response.json() as Metric;
        if (mounted) { setData(next); setLive(true); }
      } catch { if (mounted) setLive(false); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { mounted = false; window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);

  const mood = useMemo(() => {
    if (!live) return { id: "offline", title: loading ? "我在找服务器…" : "还没牵上线呢", message: loading ? "稍等我闻一闻网络。" : "连接 Linux 服务器后，我就能替你守着它。", face: "· ᴗ ·" };
    const max = Math.max(data.cpu.usage, data.memory.percent, data.disk.percent);
    if (max >= 90) return { id: "danger", title: "主人，快看这里！", message: "有一项资源快用完了，我有点担心。", face: "> ︿ <" };
    if (max >= 75) return { id: "busy", title: "今天有点忙呀", message: "服务器正在努力工作，我会继续盯着。", face: "• ︵ •" };
    return { id: "happy", title: "一切都软乎乎的", message: `你的服务器已平稳运行 ${uptime(data.meta.uptime)}。`, face: "• ᴗ •" };
  }, [data, live, loading]);

  const copy = async (id: string, value: string) => {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0";
      document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
    }
    setCopied(id); window.setTimeout(() => setCopied(""), 1600);
  };

  return (
    <main suppressHydrationWarning className={`desktop-scene ${widgetMode ? "widget-mode" : ""}`}>
      <div className="wallpaper-orb orb-one" /><div className="wallpaper-orb orb-two" />
      <section className="concept-copy">
        <span className="concept-pill">云崽 Cloudy · 桌面宠物原型</span>
        <h1>把服务器状态，<br />养成一只桌面小宠物。</h1>
        <p>它不要求你看懂复杂图表。开心、冒汗、困倦或掉线，就是服务器正在发生的事。</p>
        <div className="legend"><span><i className="dot green" />健康</span><span><i className="dot amber" />忙碌</span><span><i className="dot red" />需要处理</span></div>
      </section>

      <section className={`pet-widget ${mood.id} ${panel !== "closed" ? "expanded" : ""}`} aria-label="云崽服务器桌面宠物">
        <header className="widget-bar">
          <div><span className="tiny-logo">☁</span><b>云崽</b><small>{live ? data.meta.hostname : "演示模式"}</small></div>
          <div className="window-actions"><button aria-label="收起" onClick={() => setPanel("closed")}>—</button><button aria-label="关闭面板" onClick={() => setPanel("closed")}>×</button></div>
        </header>

        <div className="pet-stage">
          <div className="speech"><b>{mood.title}</b><span>{mood.message}</span></div>
          <button className="pet" onClick={() => setPanel(panel === "stats" ? "closed" : "stats")} aria-label="点击云崽查看服务器状态">
            <i className="ear left" /><i className="ear right" />
            <div className="cloud-puff puff-one" /><div className="cloud-puff puff-two" /><div className="cloud-puff puff-three" />
            <div className="pet-body"><span className="face">{mood.face}</span><i className="blush left" /><i className="blush right" />{mood.id === "busy" && <i className="sweat">◜</i>}{mood.id === "danger" && <i className="alert">!</i>}</div>
            <i className="foot left" /><i className="foot right" />
          </button>
          <div className="quick-stats"><span><b>{data.cpu.usage.toFixed(0)}%</b> CPU</span><span><b>{data.memory.percent.toFixed(0)}%</b> 内存</span><span><b>{data.disk.percent.toFixed(0)}%</b> 磁盘</span></div>
        </div>

        <div className="widget-buttons"><button className="primary" onClick={() => setPanel(panel === "stats" ? "closed" : "stats")}>{panel === "stats" ? "收起" : "状态"}</button><button className="explore-button" onClick={() => setPanel(panel === "explore" ? "closed" : "explore")}>{panel === "explore" ? "收起" : "服务器地图"}</button><button className="ghost" onClick={() => setPanel(panel === "setup" ? "closed" : "setup")}>{live ? "接入" : "连接"}</button></div>

        {panel === "stats" && <section className="drawer stats-drawer">
          <div className="drawer-title"><div><small>实时状态</small><h2>{data.meta.hostname}</h2></div><span className={live ? "status-tag online" : "status-tag"}>{live ? "每 5 秒更新" : "演示数据"}</span></div>
          <Meter label="CPU" value={data.cpu.usage} detail={`${data.cpu.cores} 核 · 负载 ${data.cpu.load[0].toFixed(2)}`} tone="blue" />
          <Meter label="内存" value={data.memory.percent} detail={`${gb(data.memory.used)} / ${gb(data.memory.total)}`} tone="yellow" />
          <Meter label="磁盘" value={data.disk.percent} detail={`${gb(data.disk.total - data.disk.used)} 可用`} tone="pink" />
          <div className="service-chips"><span>◇ {data.containers.filter((x) => x.state === "running").length} 个容器</span><span>● {data.databases.length} 个数据库</span><span>↗ {data.network.connections} 个连接</span></div>
        </section>}

        {panel === "explore" && <section className="drawer explore-drawer">
          <div className="drawer-title"><div><small>只读资产发现</small><h2>服务器地图</h2></div><span className="status-tag map-tag">{data.projects?.length || 0} 个项目</span></div>
          <p className="explore-intro">云崽只看名称、类型与结构，不读取代码内容、业务数据、环境变量或密钥。</p>

          <div className="section-heading"><span>项目与文件</span><small>{data.inventory?.refreshSeconds || 60} 秒刷新</small></div>
          {(data.projects || []).length === 0 ? <div className="empty-map"><b>暂时没找到可读项目</b><span>正在查看 /var/www、/srv、/opt 和 /home；受权限保护的目录不会强行读取。</span></div> : (data.projects || []).map((project) => <details className="project-card" key={project.path} open={(data.projects || []).length === 1}>
            <summary><span className="project-icon">⌘</span><span><b>{project.name}</b><small>{project.framework || project.type}</small></span><i>⌄</i></summary>
            <div className="project-meta"><code>{project.path}</code><div>{project.manifests.map((item) => <span key={item}>{item}</span>)}</div></div>
            <div className="file-tree">{project.files.slice(0, 18).map((item) => <div key={`${item.kind}-${item.path}`}><span>{item.kind === "folder" ? "▸" : "·"} {item.path}</span>{item.kind === "file" && <small>{fileSize(item.size)}</small>}</div>)}</div>
            {project.files.length > 18 && <p className="more-files">还有 {project.files.length - 18} 项已折叠</p>}
          </details>)}

          <div className="section-heading database-heading"><span>数据库结构</span><small>{data.databases?.length || 0} 个实例</small></div>
          {(data.databases || []).length === 0 ? <div className="empty-map compact"><b>没有发现数据库</b><span>支持识别 PostgreSQL、MySQL、MariaDB、Redis、MongoDB 与 SQLite。</span></div> : (data.databases || []).map((database, index) => <details className="database-card" key={`${database.type}-${database.name}-${index}`} open={(database.tables?.length || 0) > 0}>
            <summary><span className="database-dot" /><span><b>{database.type}</b><small>{database.name} · {database.status}{database.port ? ` · ${database.port}` : ""}</small></span><i>⌄</i></summary>
            {database.path && <code className="database-path">{database.path}</code>}
            {(database.tables?.length || 0) > 0 ? <div className="schema-list">{database.tables?.map((table) => <div className="schema-table" key={table.name}><b>{table.name}</b><div>{table.columns.map((column) => <span key={column.name}>{column.primary ? "◇ " : ""}{column.name}<small>{column.type || "unknown"}</small></span>)}</div></div>)}</div> : <p className="schema-locked">已识别运行服务。查看表结构需要单独配置数据库只读权限，云崽不会尝试读取密码。</p>}
          </details>)}
          <div className="map-safety">隐私边界：不返回文件内容 · 自动跳过 .env / 私钥 / 证书 · SQLite 使用只读连接</div>
        </section>}

        {panel === "setup" && <section className="drawer setup-drawer">
          <div className="drawer-title"><div><small>第一次见面</small><h2>一条命令住进服务器</h2></div><span className="status-tag">主流 Linux</span></div>
          <p className="setup-intro">默认使用原生模式：Python 采集器 + Node Web 服务由 systemd 管理，不需要 Docker。支持 x86_64 与 arm64，也不需要把 SSH、数据库密码或云密钥交给网页。</p>
          <div className="system-tags"><span>Ubuntu</span><span>Debian</span><span>Rocky</span><span>AlmaLinux</span><span>CentOS</span><span>Fedora</span><span>TencentOS</span><span>openEuler</span></div>
          <ol>
            <li><span>1</span><div><b>从 GitHub 原生安装</b><p>在服务器终端粘贴这一整行：</p><div className="command"><code>git clone https://github.com/wangxianda941030/cloudpet.git && cd cloudpet && sudo sh install-native.sh</code><button onClick={() => copy("install", "git clone https://github.com/wangxianda941030/cloudpet.git && cd cloudpet && sudo sh install-native.sh")}>{copied === "install" ? "好啦" : "复制"}</button></div></div></li>
            <li><span>2</span><div><b>桌面宠物连接一次</b><p>腾讯云防火墙放行 TCP 6121，把安装完成后显示的整条私密地址粘贴进桌面版：</p><div className="command"><code>http://公网IP:6121/?token=自动生成</code><button onClick={() => copy("url", "http://公网IP:6121/?token=自动生成")}>{copied === "url" ? "好啦" : "复制"}</button></div></div></li>
            <li><span>3</span><div><b>不想养了，一行卸载</b><p>在 cloudpet 目录中执行，会停止服务并删除应用文件和克隆目录：</p><div className="command"><code>sudo sh uninstall-native.sh && cd .. && rm -rf cloudpet</code><button onClick={() => copy("uninstall", "sudo sh uninstall-native.sh && cd .. && rm -rf cloudpet")}>{copied === "uninstall" ? "好啦" : "复制"}</button></div></div></li>
          </ol>
          <div className="privacy-note">🔒 公网只开放网页端口 6121；采集器 6120 只允许本机访问。安装器会自动生成私密令牌。完全清理专用账户可再执行 <b>sudo userdel cloudy</b>。</div>
        </section>}

        <footer className="widget-footer"><span className={live ? "connection live" : "connection"}><i />{live ? "已连接真实服务器" : "未连接 · 正在展示示例"}</span><span suppressHydrationWarning>{new Date(data.meta.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span></footer>
      </section>

      <div className="desktop-note"><span>下一步</span><p>把这个透明小窗用 Electron/Tauri 打包后，就能固定在 Windows 或 macOS 桌面最上层。</p></div>
    </main>
  );
}
