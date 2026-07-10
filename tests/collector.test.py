import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("agent", Path(__file__).parents[1] / "collector" / "agent.py")
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

data = agent.metrics()
assert 0 <= data["cpu"]["usage"] <= 100
assert data["memory"]["total"] >= 0
assert data["disk"]["total"] > 0
assert "hostname" in data["meta"]
assert "projects" in data
assert data["inventory"]["readOnly"] is True

with tempfile.TemporaryDirectory() as temporary:
    project = Path(temporary) / "sample-app"
    project.mkdir()
    (project / "package.json").write_text(json.dumps({"name": "sample-app", "dependencies": {"next": "16.0.0"}}))
    (project / ".env").write_text("SECRET=never-return-this")
    (project / "src").mkdir()
    (project / "src" / "page.tsx").write_text("export default function Page() {}")
    database = project / "app.sqlite"
    connection = sqlite3.connect(str(database))
    connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)")
    connection.commit(); connection.close()

    projects, databases = agent.discover_projects([temporary])
    assert projects[0]["framework"] == "Next.js"
    assert all(item["path"] != ".env" for item in projects[0]["files"])
    assert databases[0]["tables"][0]["name"] == "users"
    assert [column["name"] for column in databases[0]["tables"][0]["columns"]] == ["id", "email"]
print("collector smoke test passed")
