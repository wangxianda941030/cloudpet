"use client";

import { useEffect, useMemo, useState } from "react";

type Metric = {
  meta: { hostname: string; os: string; kernel: string; uptime: number; updatedAt: string };
  cpu: { usage: number; cores: number; load: number[]; temperature?: number | null };
  memory: { total: number; used: number; percent: number; swapPercent: number };
  disk: { total: number; used: number; percent: number };
  network: { rx: number; tx: number; connections: number };
  processes: Array<{ name: string; pid: number; cpu: number; memory: number; status: string }>;
  containers: Array<{ name: string; image: string; status: string; state: string; ports: string }>;
  databases: Array<{ name: string; type: string; status: string; port: string }>;
};

const demo: Metric = {
  meta: { hostname: "ubuntu-tencent-01", os: "Ubuntu 24.04 LTS", kernel: "6.8.0-31", uptime: 1283400, updatedAt: new Date().toISOString() },
  cpu: { usage: 23.8, cores: 4, load: [0.72, 0.61, 0.58], temperature: 46 },
  memory: { total: 8 * 1024 ** 3, used: 4.1 * 1024 ** 3, percent: 51.2, swapPercent: 4.1 },
  disk: { total: 80 * 1024 ** 3, used: 36.2 * 1024 ** 3, percent: 45.3 },
  network: { rx: 3.8 * 1024 ** 2, tx: 1.2 * 1024 ** 2, connections: 128 },
  processes: [
    { name: "node", pid: 2184, cpu: 12.4, memory: 8.2, status: "运行中" },
    { name: "mysqld", pid: 1260, cpu: 5.8, memory: 14.6, status: "运行中" },
    { name: "nginx", pid: 891, cpu: 2.1, memory: 1.2, status: "运行中" },
    { name: "redis-server", pid: 1422, cpu: 1.4, memory: 2.8, status: "运行中" },
  ],
  containers: [
    { name: "blog-web", image: "ghcr.io/blog/web:latest", status: "Up 18 days", state: "running", ports: "3000 → 3000" },
    { name: "mysql", image: "mysql:8.4", status: "Up 18 days (healthy)", state: "running", ports: "3306" },
    { name: "redis", image: "redis:7-alpine", status: "Up 18 days", state: "running", ports: "6379" },
  ],
  databases: [
    { name: "mysql", type: "MySQL 8.4", status: "健康", port: "3306" },
    { name: "redis", type: "Redis 7", status: "健康", port: "6379" },
  ],
};

const historySeed = [18, 22, 19, 34, 28, 31, 25, 22, 36, 31, 27, 24, 29, 23, 21, 26, 24, 23];
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const speed = (n: number) => n > 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB/s` : `${(n / 1024).toFixed(0)} KB/s`;
const uptime = (seconds: number) => `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小时`;

function Gauge({ value, color = "lime" }: { value: number; color?: "lime" | "violet" | "cyan" }) {
  return <div className={`gauge ${color}`} style={{ "--value": `${Math.min(100, Math.max(0, value)) * 3.6}deg` } as React.CSSProperties}><div><strong>{value.toFixed(0)}</strong><span>%</span></div></div>;
}

function Bars({ values, color = "lime" }: { values: number[]; color?: string }) {
  return <div className="bars" aria-label="最近性能趋势">{values.map((v, i) => <i key={i} className={color} style={{ height: `${Math.max(12, v)}%` }} />)}</div>;
}

function Dot({ ok = true }: { ok?: boolean }) { return <i className={`status-dot ${ok ? "ok" : "warn"}`} />; }

export default function Home() {
  const [data, setData] = useState<Metric>(demo);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("概览");
  const [history, setHistory] = useState(historySeed);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/metrics", { cache: "no-store" });
        if (!response.ok) throw new Error("collector unavailable");
        const next = await response.json() as Metric;
        if (mounted) { setData(next); setLive(true); setHistory((old) => [...old.slice(1), Math.round(next.cpu.usage)]); }
      } catch { if (mounted) setLive(false); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const health = useMemo(() => {
    const max = Math.max(data.cpu.usage, data.memory.percent, data.disk.percent);
    return max > 90 ? { label: "需要处理", note: "有资源即将耗尽", ok: false } : max > 75 ? { label: "需要关注", note: "资源使用率偏高", ok: false } : { label: "一切正常", note: "所有核心服务运行稳定", ok: true };
  }, [data]);

  const sections = ["概览", "性能", "存储", "网络", "Docker", "数据库", "进程"];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Y</span><div><b>云瞰</b><small>YUNKAN</small></div></div>
        <nav>{sections.map((item, i) => <button key={item} onClick={() => setActive(item)} className={active === item ? "active" : ""}><span>{["◫", "⌁", "▰", "↗", "◇", "◉", "≡"][i]}</span>{item}</button>)}</nav>
        <div className="sidebar-bottom"><button><span>⚙</span>设置</button><a href="https://github.com" target="_blank" rel="noreferrer"><span>↗</span>GitHub</a></div>
      </aside>

      <section className="workspace">
        <header>
          <div className="mobile-brand"><span className="brand-mark">Y</span><b>云瞰</b></div>
          <div className="server-title"><span className="server-icon">▰</span><div><h1>{data.meta.hostname}</h1><p><Dot />{live ? "实时连接" : "演示数据"} <em>·</em> {data.meta.os}</p></div></div>
          <div className="header-actions"><span className="refresh">{loading ? "同步中" : "每 5 秒刷新"}</span><button aria-label="通知">♢<i>2</i></button><div className="avatar">BW</div></div>
        </header>

        <div className="content">
          <section className={`health-banner ${health.ok ? "" : "attention"}`}>
            <div className="health-icon">{health.ok ? "✓" : "!"}</div>
            <div><h2>{health.label}</h2><p>{health.note}，服务器已连续运行 {uptime(data.meta.uptime)}</p></div>
            <span>上次检查：刚刚</span>
          </section>

          <section className="metrics-grid">
            <article className="metric-card"><div className="metric-top"><div><label>CPU 使用率</label><h3>{data.cpu.usage.toFixed(1)}<small>%</small></h3></div><Gauge value={data.cpu.usage} /></div><div className="metric-foot"><span>{data.cpu.cores} 核心</span><span>负载 {data.cpu.load[0].toFixed(2)}</span>{data.cpu.temperature && <span>{data.cpu.temperature}°C</span>}</div></article>
            <article className="metric-card"><div className="metric-top"><div><label>内存</label><h3>{data.memory.percent.toFixed(1)}<small>%</small></h3></div><Gauge value={data.memory.percent} color="violet" /></div><div className="progress violet"><i style={{ width: `${data.memory.percent}%` }} /></div><div className="metric-foot"><span>{gb(data.memory.used)} / {gb(data.memory.total)}</span><span>Swap {data.memory.swapPercent.toFixed(0)}%</span></div></article>
            <article className="metric-card"><div className="metric-top"><div><label>磁盘空间</label><h3>{data.disk.percent.toFixed(1)}<small>%</small></h3></div><Gauge value={data.disk.percent} color="cyan" /></div><div className="progress cyan"><i style={{ width: `${data.disk.percent}%` }} /></div><div className="metric-foot"><span>{gb(data.disk.used)} / {gb(data.disk.total)}</span><span>剩余 {gb(data.disk.total - data.disk.used)}</span></div></article>
          </section>

          <section className="middle-grid">
            <article className="panel performance"><div className="panel-heading"><div><p className="eyebrow">实时性能</p><h2>服务器呼吸很平稳</h2></div><span className="live-pill"><Dot /> LIVE</span></div><div className="chart-labels"><div><strong>{data.cpu.usage.toFixed(1)}%</strong><span>CPU</span></div><div><strong>{data.memory.percent.toFixed(1)}%</strong><span>内存</span></div></div><Bars values={history} /><div className="chart-axis"><span>90 秒前</span><span>现在</span></div></article>
            <article className="panel network"><div className="panel-heading"><div><p className="eyebrow">网络流量</p><h2>出入站速度</h2></div><span>连接数 {data.network.connections}</span></div><div className="network-values"><div><i className="down">↓</i><span>下载<strong>{speed(data.network.rx)}</strong></span></div><div><i className="up">↑</i><span>上传<strong>{speed(data.network.tx)}</strong></span></div></div><div className="network-wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></article>
          </section>

          <section className="bottom-grid">
            <article className="panel"><div className="panel-heading"><div><p className="eyebrow">服务状态</p><h2>Docker 容器</h2></div><button onClick={() => setActive("Docker")}>查看全部 →</button></div><div className="service-list">{data.containers.slice(0, 4).map((item) => <div className="service" key={item.name}><span className="service-logo">{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.image}</small></div><span className="port">{item.ports || "—"}</span><span className="healthy"><Dot ok={item.state === "running"} />{item.state === "running" ? "运行中" : item.state}</span></div>)}</div></article>
            <article className="panel"><div className="panel-heading"><div><p className="eyebrow">数据服务</p><h2>数据库</h2></div><button onClick={() => setActive("数据库")}>管理 →</button></div><div className="database-list">{data.databases.length ? data.databases.map((db) => <div className="database" key={db.name}><span className={`db-logo ${db.type.toLowerCase().includes("redis") ? "redis" : ""}`}>DB</span><div><strong>{db.name}</strong><small>{db.type} · 端口 {db.port}</small></div><span className="healthy"><Dot ok={db.status === "健康" || db.status === "running"} />{db.status}</span></div>) : <div className="empty">暂未检测到数据库容器</div>}</div><div className="tip"><span>i</span><p><b>安全提示</b>云瞰只读取运行状态，不会读取数据库中的业务数据。</p></div></article>
          </section>

          <section className="panel process-panel"><div className="panel-heading"><div><p className="eyebrow">资源排行</p><h2>最忙的进程</h2></div><button onClick={() => setActive("进程")}>查看全部 →</button></div><div className="process-table"><div className="process-row process-head"><span>进程</span><span>PID</span><span>CPU</span><span>内存</span><span>状态</span></div>{data.processes.slice(0, 5).map((p) => <div className="process-row" key={`${p.pid}-${p.name}`}><strong>{p.name}</strong><span>{p.pid}</span><span>{p.cpu.toFixed(1)}%</span><span>{p.memory.toFixed(1)}%</span><span className="healthy"><Dot />{p.status}</span></div>)}</div></section>
        </div>
        <footer><span>云瞰 v0.1.0 · 开源、自托管、数据不出服务器</span><span>{data.meta.kernel} · {new Date(data.meta.updatedAt).toLocaleTimeString("zh-CN")}</span></footer>
      </section>
    </main>
  );
}
