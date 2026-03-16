// src/examples/index.js
export async function loadExample(name) {
  const map = {
    "small_lan":      "src/examples/small_lan.json",
    "vlan_routing":   "src/examples/vlan_routing.json",
    "wan_redundant":  "src/examples/wan_redundant.json",
  };
  const path = map[name];
  if (!path) throw new Error("Example not found");

  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load example");
  return res.json();
}
