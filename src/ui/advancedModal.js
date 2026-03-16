// src/ui/advancedModal.js
// Modal "Saber más" — información educativa sobre nodos y tipos de enlace.

const NODE_INFO = {
  router: {
    img: "assets/img/Router.png",
    nombre: "Router (Enrutador)",
    que_es: "El router es el dispositivo encargado de conectar diferentes redes entre sí y dirigir el tráfico de datos hacia su destino correcto. Es como el cartero de la red: recibe un paquete y decide cuál es el mejor camino para enviarlo.",
    como_funciona: "Cada paquete de datos que circula por la red lleva una dirección IP de destino. El router lee esa dirección y consulta su tabla de rutas —una especie de mapa— para decidir por cuál de sus interfaces reenviar el paquete. Puede conectar tu red local con Internet, o unir dos oficinas remotas.",
    cuando_usarlo: "Se usa en el borde de las redes: entre tu casa e Internet (el módem-router de tu proveedor), entre distintas sedes de una empresa, o para separar redes con diferentes propósitos (administración, invitados, servidores).",
    dato_curioso: "Cada vez que visitas una página web, tus datos atraviesan en promedio entre 10 y 20 routers alrededor del mundo antes de llegar a su destino.",
  },
  switch: {
    img: "assets/img/Switch.png",
    nombre: "Switch (Conmutador)",
    que_es: "El switch conecta múltiples dispositivos dentro de la misma red local (LAN). A diferencia de un hub antiguo que enviaba la información a todos, el switch es inteligente: sabe exactamente a cuál puerto enviar cada mensaje.",
    como_funciona: "Al arrancar, el switch aprende la dirección MAC (identificador único) de cada dispositivo conectado en sus puertos. Cuando recibe un dato, consulta su tabla de MACs y lo envía únicamente al puerto del destinatario, evitando saturar el resto de la red.",
    cuando_usarlo: "En cualquier red donde varios dispositivos compartan la misma red local: la oficina con 20 computadoras, el laboratorio de informática, o el rack de servidores de una empresa.",
    dato_curioso: "Los switches empresariales pueden gestionar miles de dispositivos simultáneamente a velocidades de 10, 25 o incluso 100 Gbps por puerto.",
  },
  pc: {
    img: "assets/img/PC.png",
    nombre: "PC (Computadora)",
    que_es: "La computadora personal es el dispositivo final donde trabajan las personas. En el contexto de redes, se le llama 'host' o 'cliente': genera y consume datos, pero no los redirige hacia otros dispositivos.",
    como_funciona: "Tiene una dirección IP que la identifica en la red y una dirección MAC en su tarjeta de red. Cuando quiere comunicarse con otro dispositivo, envía sus datos al gateway (generalmente el router), que se encarga del resto.",
    cuando_usarlo: "Representa cualquier dispositivo de usuario final: laptops, computadoras de escritorio, terminales de trabajo. En simulaciones, es el punto desde donde se lanzan pings y pruebas de conectividad.",
    dato_curioso: "La primera red de computadoras (ARPANET, 1969) conectó solo 4 nodos. Hoy Internet tiene más de 5,000 millones de dispositivos conectados.",
  },
  firewall: {
    img: "assets/img/Firewall.png",
    nombre: "Firewall (Cortafuegos)",
    que_es: "El firewall es el guardián de la red. Analiza todo el tráfico que entra y sale, y decide qué permitir y qué bloquear según reglas de seguridad definidas por el administrador.",
    como_funciona: "Inspecciona cada paquete de datos y lo compara contra su lista de reglas: puede bloquear por dirección IP, puerto, protocolo o incluso por el contenido del paquete (inspección profunda). Los firewalls modernos también detectan patrones de ataque conocidos.",
    cuando_usarlo: "Siempre que haya una frontera entre zonas de diferente nivel de confianza: entre Internet y la red interna de una empresa, entre la red de usuarios y la de servidores, o para proteger sistemas críticos.",
    dato_curioso: "El término 'firewall' viene del mundo de la construcción: son las paredes cortafuegos que impiden que un incendio se propague de una zona a otra de un edificio.",
  },
  server: {
    img: "assets/img/Servidor.png",
    nombre: "Servidor",
    que_es: "Un servidor es una computadora potente que ofrece servicios a otros dispositivos de la red (los clientes). Puede servir páginas web, almacenar archivos, gestionar correos, bases de datos, o autenticar usuarios.",
    como_funciona: "Está siempre encendido y a la escucha, esperando peticiones de los clientes. Cuando llega una solicitud (ej. 'dame la página principal'), la procesa y devuelve la respuesta. Puede atender a cientos o miles de clientes al mismo tiempo.",
    cuando_usarlo: "En cualquier red donde se centralicen recursos: servidor de archivos para compartir documentos, servidor web para alojar un sitio, servidor DNS para resolver nombres de dominio, o servidor DHCP para asignar IPs automáticamente.",
    dato_curioso: "Los servidores de Google procesan más de 8,500 millones de búsquedas al día. Para ello, Google opera más de un millón de servidores repartidos en centros de datos de todo el mundo.",
  },
  cloud: {
    img: "assets/img/Cloud.png",
    nombre: "Nube / Internet",
    que_es: "El símbolo de nube representa Internet o cualquier red externa fuera del control de la organización. Es la 'caja negra' que conecta redes de todo el planeta: no sabemos exactamente cómo están conectadas internamente, solo que los datos entran y salen.",
    como_funciona: "Internet es una red de redes: miles de proveedores de servicio (ISPs) interconectados mediante acuerdos de enrutamiento. Los datos viajan en paquetes que saltan de router en router hasta llegar a su destino, pudiendo tomar rutas distintas cada vez.",
    cuando_usarlo: "Se usa para representar la conexión a Internet, a servicios en la nube (AWS, Azure, Google Cloud), a la WAN corporativa, o a cualquier red externa con la que se interactúe pero que no se gestione directamente.",
    dato_curioso: "Físicamente, el 95% del tráfico de Internet entre continentes viaja por cables de fibra óptica tendidos en el fondo del océano. Hay más de 400 cables submarinos activos hoy en día.",
  },
  ap: {
    img: "assets/img/AP.png",
    nombre: "Punto de Acceso (AP)",
    que_es: "El Access Point (AP) es el dispositivo que crea una red inalámbrica WiFi. Actúa como puente entre los dispositivos inalámbricos (laptops, teléfonos) y la red cableada.",
    como_funciona: "Emite señales de radio en frecuencias de 2.4 GHz o 5 GHz (o ambas). Los dispositivos cercanos se conectan a él inalámbricamente, y el AP retransmite su tráfico hacia el switch o router de la red cableada. Muchos APs modernos soportan WiFi 6 (802.11ax) para mayor velocidad y capacidad.",
    cuando_usarlo: "En oficinas, hospitales, aeropuertos, hoteles —cualquier lugar donde se necesite cobertura WiFi. En redes empresariales, múltiples APs se gestionan desde un controlador centralizado para ofrecer cobertura continua al moverse.",
    dato_curioso: "El estándar WiFi 6E puede alcanzar velocidades teóricas de hasta 9.6 Gbps y opera en la nueva banda de 6 GHz, con menos interferencias que las bandas anteriores.",
  },
  plc: {
    img: "assets/img/PLC.png",
    nombre: "PLC (Controlador Lógico Programable)",
    que_es: "El PLC es una computadora industrial diseñada para controlar maquinaria y procesos de fabricación. Es extremadamente robusto: funciona en ambientes con vibraciones, polvo, calor extremo y humedad donde una PC común fallaría.",
    como_funciona: "Ejecuta un programa cíclico llamado 'scan': lee las entradas (sensores, botones, señales), procesa la lógica programada, y actualiza las salidas (motores, válvulas, luces) miles de veces por segundo. En redes industriales, se comunica mediante protocolos como Modbus, Profinet o EtherNet/IP.",
    cuando_usarlo: "En líneas de ensamblaje, plantas químicas, sistemas de tratamiento de agua, redes eléctricas y cualquier proceso industrial que requiera automatización precisa y confiable. También en edificios inteligentes para controlar ascensores, climatización e iluminación.",
    dato_curioso: "El primer PLC fue creado en 1968 por General Motors para reemplazar los enormes paneles de relés en sus fábricas de automóviles. Hoy existen más de 40 millones de PLCs en operación en el mundo.",
  },
  ur3: {
    img: "assets/img/UR3.png",
    nombre: "Brazo Robótico UR3",
    que_es: "El UR3 es un brazo robótico colaborativo (cobot) fabricado por Universal Robots. A diferencia de los robots industriales tradicionales enjaulados, está diseñado para trabajar junto a personas de forma segura, deteniéndose si detecta resistencia inesperada.",
    como_funciona: "Tiene 6 articulaciones rotativas que le permiten moverse con total libertad en su espacio de trabajo. Se programa mediante una tableta táctil o guiándolo manualmente (modo enseñanza). En redes industriales, se conecta para recibir órdenes de producción, reportar estado y sincronizarse con otros equipos.",
    cuando_usarlo: "En líneas de ensamblaje flexible, laboratorios de calidad, farmacéutica y electrónica donde se requiere precisión milimétrica. Ideal para tareas repetitivas o peligrosas: soldadura, pintura, manipulación de piezas pesadas o con sustancias peligrosas.",
    dato_curioso: "El UR3 puede levantar hasta 3 kg con una repetibilidad de ±0.03 mm —más preciso que la mano humana— y opera de forma continua las 24 horas sin cansarse.",
  },
  agv: {
    img: "assets/img/AGV.png",
    nombre: "Vehículo Guiado Automático (AGV)",
    que_es: "El AGV es un vehículo de transporte autónomo que se desplaza por instalaciones industriales sin conductor. Mueve materiales, pallets o productos entre estaciones de trabajo sin intervención humana.",
    como_funciona: "Se orienta mediante diferentes tecnologías: líneas magnéticas o marcas en el suelo (guía por trayectoria), láser para mapear el entorno en tiempo real (SLAM), o cámaras con visión artificial. Se conecta a la red WiFi del almacén para recibir misiones, reportar su posición y coordinar con otros AGVs evitando colisiones.",
    cuando_usarlo: "En almacenes logísticos, hospitales (transporte de medicamentos y ropa), fábricas de automóviles y centros de distribución. Reemplaza carretillas elevadoras en rutas repetitivas y predecibles, reduciendo accidentes y costos operativos.",
    dato_curioso: "Amazon opera más de 750,000 robots AGV en sus almacenes de todo el mundo, capaces de mover estanterías enteras de hasta 1,360 kg directamente hacia los trabajadores de embalaje.",
  },
};

const LINK_INFO = {
  ethernet: {
    nombre: "Ethernet / Cable de red (UTP/FTP)",
    descripcion: "El cable Ethernet es el medio de transmisión más común en redes locales. Transmite datos mediante señales eléctricas a través de pares de cables trenzados (de ahí UTP: Unshielded Twisted Pair). El trenzado reduce las interferencias electromagnéticas entre los propios pares del cable.",
    velocidades: "Cat5e: hasta 1 Gbps · Cat6: hasta 10 Gbps (hasta 55 m) · Cat6A: hasta 10 Gbps (hasta 100 m) · Cat8: hasta 40 Gbps (hasta 30 m)",
    uso: "Conexión de computadoras a switches, switches entre sí, y routers en redes de oficina y hogar. Es económico, fácil de instalar y suficientemente rápido para la mayoría de usos.",
  },
  fiber: {
    nombre: "Fibra Óptica",
    descripcion: "La fibra óptica transmite datos como pulsos de luz a través de un hilo de vidrio o plástico del grosor de un cabello. Al usar luz en vez de electricidad, es inmune a interferencias electromagnéticas, puede cubrir grandes distancias y ofrece velocidades altísimas.",
    velocidades: "Monomodo: hasta 100 Gbps y más de 80 km · Multimodo: hasta 100 Gbps (distancias cortas, 550 m) · Redes experimentales han superado los 10 Tbps.",
    uso: "Backbone de redes corporativas, conexiones entre edificios o ciudades, redes de operadores y data centers. Imprescindible cuando se necesita alta velocidad, gran distancia o resistencia a interferencias.",
  },
  wifi: {
    nombre: "WiFi (Inalámbrico 802.11)",
    descripcion: "WiFi transmite datos usando ondas de radio en las bandas de 2.4 GHz y 5 GHz (WiFi 6E también usa 6 GHz). No requiere cables físicos entre dispositivos y el punto de acceso, lo que da movilidad. A cambio, la señal puede verse afectada por paredes, distancia y otras redes cercanas.",
    velocidades: "WiFi 4 (802.11n): hasta 600 Mbps · WiFi 5 (802.11ac): hasta 3.5 Gbps · WiFi 6 (802.11ax): hasta 9.6 Gbps · WiFi 6E agrega la banda de 6 GHz para menos congestión.",
    uso: "Conectar laptops, teléfonos, tablets e IoT sin cables. Ideal en espacios donde tender cable es difícil o costoso, como edificios históricos, almacenes o para usuarios móviles.",
  },
  serial: {
    nombre: "Enlace Serial WAN",
    descripcion: "Los enlaces seriales WAN eran la tecnología dominante para conectar redes distantes antes de la fibra óptica masiva. Transmiten los bits uno a uno (en serie) a través de líneas arrendadas o circuitos de operador. Son lentos comparados con tecnologías modernas, pero muy confiables y ampliamente usados en zonas remotas.",
    velocidades: "T1/E1: 1.544 / 2.048 Mbps · T3/E3: 44.7 / 34.4 Mbps · Hoy en día se mantienen en entornos heredados o rurales donde fibra y ADSL no llegan.",
    uso: "Conexión entre routers en topologías WAN empresariales, enlaces punto a punto entre sedes remotas, redes heredadas que aún no han migrado a fibra.",
  },
  adsl: {
    nombre: "ADSL (Banda Ancha por Línea Telefónica)",
    descripcion: "ADSL (Asymmetric Digital Subscriber Line) usa la misma línea telefónica de cobre del hogar para transmitir datos digitales de alta velocidad junto con la voz. Es 'asimétrico' porque la velocidad de descarga (bajada) es mucho mayor que la de subida: lo cual tiene sentido ya que los usuarios descargan mucho más de lo que suben.",
    velocidades: "ADSL2+: hasta 24 Mbps bajada / 1 Mbps subida · VDSL2: hasta 100 Mbps bajada / 50 Mbps subida · La velocidad real depende mucho de la distancia a la central telefónica.",
    uso: "Conexión a Internet residencial y de pequeñas empresas donde no hay fibra disponible. Muy extendido en zonas urbanas y rurales durante los años 2000-2010s, aunque está siendo gradualmente reemplazado por fibra hasta el hogar (FTTH).",
  },
};

export function createAdvancedModal({ dispatch, ActionTypes, getState }) {
  const backdrop  = document.getElementById("adv-modal-backdrop");
  if (!backdrop) return { open: () => {} };

  const titleEl   = document.getElementById("adv-modal-title");
  const bodyEl    = document.getElementById("adv-modal-body");
  const closeBtn  = document.getElementById("adv-modal-close");
  const cancelBtn = document.getElementById("adv-modal-cancel");
  const applyBtn  = document.getElementById("adv-modal-apply");

  // Ocultar botones de edición (no aplica en modo informativo)
  if (cancelBtn) cancelBtn.style.display = "none";
  if (applyBtn)  applyBtn.style.display  = "none";

  function open(kind, id) {
    _render(kind, id);
    backdrop.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function close() {
    backdrop.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function _render(kind, id) {
    if (!bodyEl) return;
    const state = getState();

    if (kind === "node") {
      const node = state.graph.nodes.find(n => n.id === id);
      if (!node) { close(); return; }
      const info = NODE_INFO[node.type] || _fallbackNodeInfo(node.type);
      if (titleEl) titleEl.textContent = info.nombre;
      _renderNodeInfo(info);
    } else {
      const link = state.graph.links.find(l => l.id === id);
      if (!link) { close(); return; }
      const mediaKey = link.mediaType || "ethernet";
      const info = LINK_INFO[mediaKey] || LINK_INFO.ethernet;
      const src = state.graph.nodes.find(n => n.id === link.source);
      const tgt = state.graph.nodes.find(n => n.id === link.target);
      const linkLabel = src && tgt ? `${src.label} ↔ ${tgt.label}` : "Enlace";
      if (titleEl) titleEl.textContent = `${linkLabel} — ${info.nombre}`;
      _renderLinkInfo(info, link);
    }
  }

  function _renderNodeInfo(info) {
    bodyEl.innerHTML = `
      <div class="saber-mas-card">
        <div class="saber-mas-img-wrap">
          <img class="saber-mas-img" src="${info.img}" alt="${_esc(info.nombre)}" />
        </div>
        <div class="saber-mas-sections">
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-circle-question"></i> ¿Qué es?
            </div>
            <p class="saber-mas-text">${_esc(info.que_es)}</p>
          </div>
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-gears"></i> ¿Cómo funciona?
            </div>
            <p class="saber-mas-text">${_esc(info.como_funciona)}</p>
          </div>
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-map-pin"></i> ¿Cuándo se usa?
            </div>
            <p class="saber-mas-text">${_esc(info.cuando_usarlo)}</p>
          </div>
          <div class="saber-mas-curious">
            <i class="fa-solid fa-lightbulb"></i>
            <span>${_esc(info.dato_curioso)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function _renderLinkInfo(info, link) {
    const mediaKey = link.mediaType || "ethernet";
    const mediaIcons = { ethernet: "fa-ethernet", fiber: "fa-bolt", wifi: "fa-wifi", serial: "fa-arrows-left-right", adsl: "fa-phone" };
    const icon = mediaIcons[mediaKey] || "fa-link";

    bodyEl.innerHTML = `
      <div class="saber-mas-card saber-mas-card--link">
        <div class="saber-mas-link-header">
          <div class="saber-mas-link-icon">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="saber-mas-link-stats">
            <span class="saber-mas-stat"><i class="fa-solid fa-gauge-high"></i> ${link.latencyMs ?? 0.5} ms latencia</span>
            <span class="saber-mas-stat"><i class="fa-solid fa-arrow-right-arrow-left"></i> ${link.bandwidthMbps ?? 1000} Mbps</span>
            <span class="saber-mas-stat"><i class="fa-solid fa-triangle-exclamation"></i> ${link.lossPct ?? 0}% pérdida</span>
          </div>
        </div>
        <div class="saber-mas-sections">
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-circle-question"></i> ¿Qué es?
            </div>
            <p class="saber-mas-text">${_esc(info.descripcion)}</p>
          </div>
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-tachometer-alt"></i> Velocidades típicas
            </div>
            <p class="saber-mas-text saber-mas-text--mono">${_esc(info.velocidades)}</p>
          </div>
          <div class="saber-mas-section">
            <div class="saber-mas-section-title">
              <i class="fa-solid fa-map-pin"></i> ¿Cuándo se usa?
            </div>
            <p class="saber-mas-text">${_esc(info.uso)}</p>
          </div>
        </div>
      </div>
    `;
  }

  function _fallbackNodeInfo(type) {
    return {
      img: "",
      nombre: type,
      que_es: "Dispositivo de red.",
      como_funciona: "Participa en la comunicación dentro de la red.",
      cuando_usarlo: "Según el rol que cumpla en la topología.",
      dato_curioso: "Las redes permiten que los dispositivos compartan información de forma eficiente.",
    };
  }

  // Wiring
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  document.getElementById("adv-modal-close-footer")?.addEventListener("click", close);
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !backdrop.classList.contains("hidden")) close();
  });

  return { open, close };
}

function _esc(str) {
  return String(str ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
