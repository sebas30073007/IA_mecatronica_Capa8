// src/examples/index.js
export async function loadExample(name) {
  const map = {
    "small_lan":      "src/examples/small_lan.json",
    "vlan_routing":   "src/examples/vlan_routing.json",
    "wan_redundant":  "src/examples/wan_redundant.json",
    "data_center":    "src/examples/data_center.json",
    "home_network":   "src/examples/home_network.json",
    "dmz":            "src/examples/dmz.json",
    "campus":              "src/examples/campus.json",
    "mpls_wan":            "src/examples/mpls_wan.json",
    "red_industrial":      "src/examples/red_industrial.json",
    "red_universitaria":   "src/examples/red_universitaria.json",
    "este_proyecto":       "src/examples/este_proyecto.json",
  };
  const path = map[name];
  if (!path) throw new Error("Example not found");

  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load example");
  return res.json();
}
