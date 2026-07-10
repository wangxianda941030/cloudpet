#!/usr/bin/env python3
"""Cloudy collector: read-only Linux and Docker metrics, stdlib only."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, os, platform, shutil, socket, subprocess, time, urllib.parse

PROC = Path(os.getenv("CLOUDY_PROC", "/proc"))
ROOT = os.getenv("CLOUDY_ROOT", "/")
started = time.time()
last_cpu = None
last_net = None

def read(path, default=""):
    try: return (PROC / path).read_text()
    except (OSError, PermissionError): return default

def cpu_usage():
    global last_cpu
    lines = read("stat").splitlines()
    if not lines: return 0.0
    parts = [int(v) for v in lines[0].split()[1:]]
    idle, total = parts[3] + parts[4], sum(parts)
    usage = 0.0 if last_cpu is None else 100 * (1 - (idle-last_cpu[0]) / max(1, total-last_cpu[1]))
    last_cpu = (idle, total)
    return round(max(0, min(100, usage)), 1)

def memory():
    values = {}
    for line in read("meminfo").splitlines():
        key, val = line.split(":", 1); values[key] = int(val.strip().split()[0]) * 1024
    total = values.get("MemTotal", 0); available = values.get("MemAvailable", 0)
    swap_total = values.get("SwapTotal", 0); swap_free = values.get("SwapFree", 0)
    used = max(0, total - available)
    return {"total": total, "used": used, "percent": round(used/max(1,total)*100,1), "swapPercent": round((swap_total-swap_free)/max(1,swap_total)*100,1)}

def network():
    global last_net
    rx = tx = 0
    for line in read("net/dev").splitlines()[2:]:
        fields = line.replace(":", " ").split()
        if fields and fields[0] != "lo": rx += int(fields[1]); tx += int(fields[9])
    now = time.time(); speed_rx = speed_tx = 0
    if last_net:
        elapsed=max(.1,now-last_net[2]); speed_rx=(rx-last_net[0])/elapsed; speed_tx=(tx-last_net[1])/elapsed
    last_net=(rx,tx,now)
    try: connections=max(0,len(read("net/tcp").splitlines())-1)+max(0,len(read("net/tcp6").splitlines())-1)
    except Exception: connections=0
    return {"rx": round(max(0,speed_rx)), "tx": round(max(0,speed_tx)), "connections": connections}

def top_processes():
    rows=[]
    try:
        output=subprocess.check_output(["ps","-eo","pid,comm,%cpu,%mem,state","--sort=-%cpu"],text=True,timeout=2,stderr=subprocess.DEVNULL)
        for line in output.splitlines()[1:9]:
            parts=line.split()
            if len(parts)>=5: rows.append({"pid":int(parts[0]),"name":parts[1][:34],"cpu":float(parts[2]),"memory":float(parts[3]),"status":"运行中" if parts[4][0] not in "TZ" else "休眠"})
    except Exception: pass
    return rows

def docker_get(path):
    sock_path="/var/run/docker.sock"
    if not os.path.exists(sock_path): return []
    try:
        s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.settimeout(2); s.connect(sock_path)
        s.sendall(f"GET {path} HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n".encode())
        response=b""
        while True:
            chunk=s.recv(65536)
            if not chunk: break
            response+=chunk
        s.close(); body=response.split(b"\r\n\r\n",1)[1]
        if b"transfer-encoding: chunked" in response.split(b"\r\n\r\n",1)[0].lower():
            decoded=b""; pos=0
            while pos<len(body):
                end=body.find(b"\r\n",pos); size=int(body[pos:end],16)
                if size==0: break
                pos=end+2; decoded+=body[pos:pos+size]; pos+=size+2
            body=decoded
        return json.loads(body)
    except Exception: return []

def containers():
    raw=docker_get("/containers/json?all=1"); result=[]; databases=[]
    types={"postgres":"PostgreSQL","mysql":"MySQL","mariadb":"MariaDB","redis":"Redis","mongo":"MongoDB"}
    default_ports={"PostgreSQL":"5432","MySQL":"3306","MariaDB":"3306","Redis":"6379","MongoDB":"27017"}
    for item in raw if isinstance(raw,list) else []:
        name=(item.get("Names") or ["unnamed"])[0].lstrip("/"); image=item.get("Image","")
        ports=", ".join(str(p.get("PublicPort") or p.get("PrivatePort") or "") for p in item.get("Ports",[]) if p.get("PrivatePort"))
        state=item.get("State","unknown")
        result.append({"name":name,"image":image,"status":item.get("Status",""),"state":state,"ports":ports})
        haystack=(name+" "+image).lower()
        for key,label in types.items():
            if key in haystack:
                databases.append({"name":name,"type":label,"status":"健康" if state=="running" else state,"port":ports or default_ports[label]}); break
    return result,databases

def metrics():
    containers_list, databases = containers()
    try: usage=shutil.disk_usage(ROOT)
    except OSError: usage=shutil.disk_usage("/")
    try: load=list(os.getloadavg())
    except OSError: load=[0,0,0]
    os_name=platform.platform()
    try:
        release={}
        for line in (Path(ROOT) / "etc/os-release").read_text().splitlines():
            if "=" in line: k,v=line.split("=",1); release[k]=v.strip('"')
        os_name=release.get("PRETTY_NAME",os_name)
    except OSError: pass
    return {
      "meta":{"hostname":socket.gethostname(),"os":os_name,"kernel":platform.release(),"uptime":float(read("uptime","0").split()[0]),"updatedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())},
      "cpu":{"usage":cpu_usage(),"cores":os.cpu_count() or 1,"load":[round(v,2) for v in load],"temperature":None},
      "memory":memory(),"disk":{"total":usage.total,"used":usage.used,"percent":round(usage.used/max(1,usage.total)*100,1)},
      "network":network(),"processes":top_processes(),"containers":containers_list,"databases":databases
    }

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urllib.parse.urlparse(self.path).path not in ("/metrics","/api/metrics","/health"):
            self.send_error(404); return
        payload={"ok":True} if self.path=="/health" else metrics()
        body=json.dumps(payload,ensure_ascii=False).encode()
        self.send_response(200); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, fmt, *args): pass

if __name__ == "__main__":
    port=int(os.getenv("PORT","6120")); print(f"Cloudy collector listening on :{port}")
    ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
