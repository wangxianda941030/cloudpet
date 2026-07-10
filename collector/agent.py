#!/usr/bin/env python3
"""Cloudy collector: read-only Linux and Docker metrics, stdlib only."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, os, platform, shutil, socket, sqlite3, subprocess, time, urllib.parse

PROC = Path(os.getenv("CLOUDY_PROC", "/proc"))
ROOT = os.getenv("CLOUDY_ROOT", "/")
started = time.time()
last_cpu = None
last_net = None
inventory_cache = {"at": 0, "projects": [], "databases": []}

SCAN_ROOTS = [item.strip() for item in os.getenv("CLOUDY_SCAN_ROOTS", "/var/www,/srv,/opt,/home").split(",") if item.strip()]
SKIP_DIRS = {".git", ".hg", ".svn", "node_modules", "vendor", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache", "coverage", "proc", "sys", "dev"}
SENSITIVE_NAMES = {".env", ".env.local", ".env.production", "id_rsa", "id_ed25519", "credentials", "credentials.json", "secrets.json"}
MANIFESTS = {"package.json", "pyproject.toml", "requirements.txt", "manage.py", "composer.json", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}

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

def safe_manifest_text(path, limit=262144):
    try:
        if path.stat().st_size > limit: return ""
        return path.read_text(errors="ignore")
    except (OSError, PermissionError): return ""

def project_identity(directory, names):
    project_type = framework = ""
    name = directory.name
    if "package.json" in names:
        project_type = "Node.js"
        text = safe_manifest_text(directory / "package.json")
        try: name = json.loads(text).get("name") or name
        except (ValueError, TypeError): pass
        checks = [("next", "Next.js"), ("nuxt", "Nuxt"), ("@nestjs/core", "NestJS"), ("express", "Express"), ("vite", "Vite"), ("react", "React"), ("vue", "Vue")]
        framework = next((label for key, label in checks if f'"{key}"' in text), "Node.js")
    elif {"pyproject.toml", "requirements.txt", "manage.py"} & names:
        project_type = "Python"
        text = "\n".join(safe_manifest_text(directory / item) for item in ("pyproject.toml", "requirements.txt") if item in names).lower()
        framework = "Django" if "manage.py" in names or "django" in text else "FastAPI" if "fastapi" in text else "Flask" if "flask" in text else "Python"
    elif "composer.json" in names:
        project_type = "PHP"; text = safe_manifest_text(directory / "composer.json"); framework = "Laravel" if "laravel/framework" in text else "Composer"
    elif "go.mod" in names: project_type = framework = "Go"
    elif "Cargo.toml" in names: project_type = framework = "Rust"
    elif {"pom.xml", "build.gradle"} & names: project_type = "Java"; framework = "Maven" if "pom.xml" in names else "Gradle"
    elif "Gemfile" in names: project_type = "Ruby"; framework = "Rails" if "rails" in safe_manifest_text(directory / "Gemfile").lower() else "Ruby"
    elif {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"} & names: project_type = framework = "Docker Compose"
    return name[:80], project_type, framework

def visible_tree(directory, max_entries=80, max_depth=3):
    entries = []
    base_depth = len(directory.parts)
    try:
        for current, dirs, files in os.walk(str(directory)):
            current_path = Path(current)
            depth = len(current_path.parts) - base_depth
            dirs[:] = sorted(item for item in dirs if item not in SKIP_DIRS and not item.startswith("."))
            if depth >= max_depth: dirs[:] = []
            for item in dirs:
                entries.append({"path": str((current_path / item).relative_to(directory)), "kind": "folder"})
                if len(entries) >= max_entries: return entries
            for item in sorted(files):
                if item in SENSITIVE_NAMES or item.startswith(".env") or item.endswith((".pem", ".key", ".p12", ".pfx")): continue
                path = current_path / item
                try: size = path.stat().st_size
                except OSError: size = 0
                entries.append({"path": str(path.relative_to(directory)), "kind": "file", "size": size})
                if len(entries) >= max_entries: return entries
    except (OSError, PermissionError): pass
    return entries

def sqlite_schema(path):
    tables = []
    try:
        uri = "file:" + urllib.parse.quote(str(path)) + "?mode=ro"
        connection = sqlite3.connect(uri, uri=True, timeout=1)
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 30").fetchall()
        for (name,) in rows:
            quoted = str(name).replace('"', '""')
            columns = connection.execute(f'PRAGMA table_info("{quoted}")').fetchall()
            tables.append({"name": str(name)[:100], "columns": [{"name": str(row[1])[:100], "type": str(row[2] or "unknown")[:60], "primary": bool(row[5])} for row in columns[:50]]})
        connection.close()
    except (sqlite3.Error, OSError, PermissionError): return []
    return tables

def discover_projects(scan_roots=None, max_projects=20, max_dirs=800):
    projects = []; sqlite_databases = []; visited = 0
    roots = scan_roots if scan_roots is not None else SCAN_ROOTS
    for root_name in roots:
        root = Path(root_name)
        if not root.exists() or not root.is_dir(): continue
        try:
            walker = os.walk(str(root))
            for current, dirs, files in walker:
                visited += 1
                current_path = Path(current)
                dirs[:] = sorted(item for item in dirs if item not in SKIP_DIRS and not item.startswith("."))
                if len(current_path.parts) - len(root.parts) >= 5: dirs[:] = []
                names = set(files)
                manifests = sorted(names & MANIFESTS)
                if manifests:
                    name, project_type, framework = project_identity(current_path, names)
                    project = {"name": name, "path": str(current_path), "type": project_type, "framework": framework, "manifests": manifests, "files": visible_tree(current_path)}
                    projects.append(project)
                    for base, subdirs, db_files in os.walk(str(current_path)):
                        subdirs[:] = [item for item in subdirs if item not in SKIP_DIRS and not item.startswith(".")]
                        if len(Path(base).parts) - len(current_path.parts) >= 4: subdirs[:] = []
                        for filename in db_files:
                            if filename.lower().endswith((".db", ".sqlite", ".sqlite3")):
                                db_path = Path(base) / filename
                                try:
                                    if db_path.stat().st_size > 512 * 1024 * 1024: continue
                                except OSError: continue
                                tables = sqlite_schema(db_path)
                                if tables: sqlite_databases.append({"name": filename[:100], "type": "SQLite", "status": "只读", "port": "文件", "path": str(db_path), "source": "file", "tables": tables})
                                if len(sqlite_databases) >= 20: break
                    dirs[:] = []
                    if len(projects) >= max_projects: return projects, sqlite_databases
                if visited >= max_dirs: return projects, sqlite_databases
        except (OSError, PermissionError): continue
    return projects, sqlite_databases

def native_databases():
    detected = []
    definitions = [("postgres", "PostgreSQL", "5432"), ("mysqld", "MySQL", "3306"), ("mariadbd", "MariaDB", "3306"), ("redis-server", "Redis", "6379"), ("mongod", "MongoDB", "27017")]
    try: process_names = subprocess.check_output(["ps", "-eo", "comm="], text=True, timeout=2, stderr=subprocess.DEVNULL).lower()
    except Exception: process_names = ""
    for command, label, port in definitions:
        if command in process_names: detected.append({"name": label.lower(), "type": label, "status": "运行中", "port": port, "source": "process", "tables": []})
    return detected

def inventory(force=False):
    global inventory_cache
    now = time.time()
    if not force and now - inventory_cache["at"] < 60: return inventory_cache["projects"], inventory_cache["databases"]
    projects, file_databases = discover_projects()
    databases = native_databases() + file_databases
    inventory_cache = {"at": now, "projects": projects, "databases": databases}
    return projects, databases

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
    containers_list, container_databases = containers()
    projects, discovered_databases = inventory()
    seen = set(); databases = []
    for database in container_databases + discovered_databases:
        key = (database.get("type"), database.get("name"), database.get("path"))
        if key not in seen: seen.add(key); databases.append(database)
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
      "network":network(),"processes":top_processes(),"containers":containers_list,"databases":databases,"projects":projects,
      "inventory":{"scanRoots":SCAN_ROOTS,"refreshSeconds":60,"readOnly":True,"fileContents":False}
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
    port=int(os.getenv("PORT","6120")); bind=os.getenv("CLOUDY_BIND","0.0.0.0")
    print(f"Cloudy collector listening on {bind}:{port}")
    ThreadingHTTPServer((bind,port),Handler).serve_forever()
