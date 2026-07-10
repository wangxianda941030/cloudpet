import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("agent", Path(__file__).parents[1] / "collector" / "agent.py")
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

data = agent.metrics()
assert 0 <= data["cpu"]["usage"] <= 100
assert data["memory"]["total"] >= 0
assert data["disk"]["total"] > 0
assert "hostname" in data["meta"]
print("collector smoke test passed")
