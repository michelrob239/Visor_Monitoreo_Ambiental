const API="http://127.0.0.1:8000";
const mapa=L.map("map").setView([-11.85,-76.95],9);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:"&copy; OpenStreetMap contributors"
}).addTo(mapa);

const capas={},datos={};
let grafico=null;

const estilos={
    distritos:{color:"#64748b",weight:1,fillColor:"#94a3b8",fillOpacity:.08},
    rios:{color:"#0284c7",weight:3}
};

function formatoNombre(texto){
    if(!texto)return"No disponible";
    return String(texto).toLowerCase().replace(/\b\w/g,l=>l.toUpperCase());
}

function popupDistrito(p){
    return `<div class="popup distrito-popup">
        <div class="popup-header distrito-header">
            <div class="popup-icon">D</div>
            <div>
                <div class="popup-titulo">Información distrital</div>
                <div class="popup-nombre">${formatoNombre(p.nombdist)}</div>
            </div>
        </div>
        <div class="popup-datos">
            <div class="dato"><span>Distrito:</span><b>${formatoNombre(p.nombdist)}</b></div>
            <div class="dato"><span>Provincia:</span><b>${formatoNombre(p.nombprov)}</b></div>
            <div class="dato"><span>Departamento:</span><b>${formatoNombre(p.nombdep)}</b></div>
        </div>
    </div>`;
}

function popupRio(p){
    return `<div class="popup">
        <div class="popup-header agua-header">
            <div>
                <div class="popup-titulo">Calidad de agua</div>
                <div class="popup-nombre">${p.nombre||"Río sin nombre"}</div>
            </div>
        </div>
        <div class="popup-datos">
            <div><span>Tipo:</span><b>${p.rasgo_prin||"Río"}</b></div>
            <div><span>Condición:</span><b>${p.rasgo_secu||"No disponible"}</b></div>
        </div>
        <div class="popup-footer">
            <span class="estado-punto"></span>
            Recurso hídrico monitoreado
        </div>
    </div>`;
}

function popupEstacion(p){
    const esAgua=String(p.tipo||"").toLowerCase().includes("agua");

    return `<div class="popup estacion-popup">
        <div class="popup-header ${esAgua?"agua-header":"aire-header"}">
            <div class="popup-icon">${esAgua?"AGUA":"AIRE"}</div>
            <div>
                <div class="popup-titulo">${p.tipo||"Monitoreo ambiental"}</div>
                <div class="popup-nombre">${p.nombre||"Estación de monitoreo"}</div>
            </div>
        </div>
        <div class="popup-datos">
            <div><span>Distrito:</span><b>${formatoNombre(p.distrito)}</b></div>
            <div><span>Parámetro principal:</span><b>${p.parametro_principal||"No disponible"}</b></div>
        </div>
        <div id="medicion-${p.id}" class="ultima-medicion">
            <div class="medicion-cargando">Cargando última medición...</div>
        </div>
    </div>`;
}

async function cargarUltimaMedicion(id){
    try{
        const respuesta=await fetch(`${API}/mediciones/${id}`);
        if(!respuesta.ok)throw new Error(`HTTP ${respuesta.status}`);

        const mediciones=await respuesta.json();
        const contenedor=document.getElementById(`medicion-${id}`);

        if(!contenedor)return;

        if(!mediciones.length){
            contenedor.innerHTML=`<div class="sin-medicion">No existen mediciones registradas.</div>`;
            return;
        }

        const fecha=mediciones.reduce((ultima,actual)=>
            actual.fecha>ultima.fecha?actual:ultima).fecha;

        const ultima=mediciones.filter(m=>m.fecha===fecha);

        contenedor.innerHTML=`
            <div class="medicion-titulo">
                <span>Última medición</span>
                <small>${formatearFecha(fecha)}</small>
            </div>
            <div class="medicion-valores">
                ${ultima.map(m=>`
                    <div class="medicion-item">
                        <span>${m.parametro}</span>
                        <strong>${m.valor}</strong>
                        <small>${m.unidad}</small>
                    </div>
                `).join("")}
            </div>
            <button class="btn-serie" onclick="mostrarSerie(${id})">Ver serie histórica</button>`;
    }
    catch(error){
        console.error("Error obteniendo mediciones:",error);

        const contenedor=document.getElementById(`medicion-${id}`);

        if(contenedor)
            contenedor.innerHTML=`<div class="sin-medicion">No se pudieron cargar las mediciones.</div>`;
    }
}

function formatearFecha(fecha){
    const partes=String(fecha).split("-");
    return partes.length===3?`${partes[2]}/${partes[1]}/${partes[0]}`:fecha;
}

async function mostrarSerie(id){
    try{
        const respuesta=await fetch(`${API}/mediciones/${id}`);
        if(!respuesta.ok)throw new Error(`HTTP ${respuesta.status}`);

        const mediciones=await respuesta.json();

        const estacion=datos.estaciones.features.find(
            f=>Number(f.properties.id)===Number(id)
        );

        if(!estacion)return;

        const p=estacion.properties||{};
        const parametros=[...new Set(mediciones.map(m=>m.parametro))];

        const contenido=`
            <div class="serie-popup">
                <div class="serie-header">
                    <span>Serie histórica</span>
                    <b>${p.nombre||"Estación"}</b>
                </div>
                <select id="parametroSerie-${id}" class="selector-serie">
                    ${parametros.map(parametro=>
                        `<option value="${parametro}">${parametro}</option>`
                    ).join("")}
                </select>
                <div class="grafico-popup">
                    <canvas id="grafico-${id}"></canvas>
                </div>
            </div>`;

        const c=estacion.geometry.coordinates;

        L.popup({maxWidth:430,minWidth:380})
            .setLatLng([c[1],c[0]])
            .setContent(contenido)
            .openOn(mapa);

        setTimeout(()=>{
            const selector=document.getElementById(`parametroSerie-${id}`);

            if(!selector)return;

            crearGraficoPopup(id,mediciones,selector.value);

            selector.addEventListener("change",()=>{
                crearGraficoPopup(id,mediciones,selector.value);
            });
        },100);

    }catch(error){
        console.error("Error mostrando serie:",error);
    }
}

function crearGraficoPopup(id,mediciones,parametro){
    const datosParametro=mediciones.filter(m=>m.parametro===parametro);
    const fechas=datosParametro.map(m=>formatearFecha(m.fecha));
    const valores=datosParametro.map(m=>m.valor);
    const unidad=datosParametro[0]?.unidad||"";
    const canvas=document.getElementById(`grafico-${id}`);

    if(!canvas)return;
    if(grafico)grafico.destroy();

    grafico=new Chart(canvas,{
        type:"line",
        data:{
            labels:fechas,
            datasets:[{
                label:`${parametro} (${unidad})`,
                data:valores,
                borderWidth:2,
                pointRadius:4,
                tension:.3,
                fill:false
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{legend:{display:true}},
            scales:{y:{beginAtZero:false}}
        }
    });
}

function crearMarcadorEstacion(feature,latlng){
    const p=feature.properties||{};
    const esAgua=String(p.tipo||"").toLowerCase().includes("agua");

    const marcador=L.circleMarker(latlng,{
        radius:8,
        color:esAgua?"#0284c7":"#dc2626",
        weight:2,
        fillColor:esAgua?"#0284c7":"#dc2626",
        fillOpacity:.95
    });

    marcador.bindPopup(popupEstacion(p));

    marcador.on("popupopen",()=>{
        cargarUltimaMedicion(p.id);
    });

    return marcador;
}

async function cargarCapa(nombre){
    try{
        const respuesta=await fetch(`${API}/${nombre}`);

        if(!respuesta.ok)
            throw new Error(`HTTP ${respuesta.status}`);

        const geojson=await respuesta.json();
        datos[nombre]=geojson;

        capas[nombre]=L.geoJSON(geojson,{
            style:estilos[nombre],

            pointToLayer:nombre==="estaciones"
                ?crearMarcadorEstacion
                :undefined,

            onEachFeature:(feature,layer)=>{
                const p=feature.properties||{};

                if(nombre==="distritos")
                    layer.bindPopup(popupDistrito(p));

                if(nombre==="rios")
                    layer.bindPopup(popupRio(p));
            }
        });

        capas[nombre].addTo(mapa);

        if(nombre==="distritos")
            capas[nombre].bringToBack();

        if(nombre==="rios")
            capas[nombre].bringToFront();

        if(nombre==="estaciones")
            capas[nombre].bringToFront();

        return true;

    }catch(error){
        console.error(`Error cargando ${nombre}:`,error);
        return false;
    }
}

function cambiarCapa(nombre,visible){
    if(!capas[nombre])return;

    if(visible){
        capas[nombre].addTo(mapa);

        if(nombre==="distritos")
            capas[nombre].bringToBack();

        if(nombre==="rios"||nombre==="estaciones")
            capas[nombre].bringToFront();

    }else{
        mapa.removeLayer(capas[nombre]);
    }
}

function normalizarTexto(texto){
    return String(texto||"")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toLowerCase()
        .trim();
}

function buscar(){
    const texto=normalizarTexto(
        document.getElementById("buscador").value
    );

    const resultado=document.getElementById("resultado");

    if(!texto){
        resultado.textContent="Escribe un nombre para buscar.";
        return;
    }

    if(!datos.estaciones?.features){
        resultado.textContent="No hay estaciones cargadas.";
        return;
    }

    const encontrados=[];

    datos.estaciones.features.forEach(feature=>{
        const p=feature.properties||{};

        const valores=[
            p.nombre,
            p.distrito,
            p.tipo,
            p.parametro_principal
        ]
        .filter(Boolean)
        .map(normalizarTexto)
        .join(" ");

        if(valores.includes(texto))
            encontrados.push(feature);
    });

    if(!encontrados.length){
        resultado.textContent=`No se encontró "${texto}".`;
        return;
    }

    const elementos=[];

    encontrados.forEach(feature=>{
        let marcadorEncontrado=null;

        capas.estaciones.eachLayer(layer=>{
            if(
                layer.feature===feature ||
                Number(layer.feature?.properties?.id)===
                Number(feature.properties?.id)
            ){
                marcadorEncontrado=layer;
            }
        });

        if(marcadorEncontrado)
            elementos.push(marcadorEncontrado);
    });

    if(!elementos.length){
        resultado.textContent="Las estaciones encontradas no están visibles.";
        return;
    }

    const grupo=L.featureGroup(elementos);

    mapa.fitBounds(grupo.getBounds(),{
        padding:[50,50],
        maxZoom:14
    });

    resultado.innerHTML=
        `<b>${elementos.length}</b> estación(es) encontrada(s).`;

    setTimeout(()=>{
        elementos[0].openPopup();
    },300);
}

document.querySelectorAll(".tipo").forEach(boton=>{
    boton.addEventListener("click",()=>{
        document.querySelectorAll(".tipo").forEach(b=>
            b.classList.remove("activo")
        );

        boton.classList.add("activo");
    });
});

["distritos","rios","estaciones"].forEach(tipo=>{
    const elemento=document.getElementById(tipo);

    if(elemento){
        elemento.addEventListener("change",e=>
            cambiarCapa(tipo,e.target.checked)
        );
    }
});

document.getElementById("btnBuscar")
    .addEventListener("click",buscar);

document.getElementById("buscador")
    .addEventListener("keydown",e=>{
        if(e.key==="Enter")buscar();
    });

async function iniciar(){
    const resultados=await Promise.all([
        cargarCapa("distritos"),
        cargarCapa("rios"),
        cargarCapa("estaciones")
    ]);

    document.getElementById("estado").textContent=
        `${resultados.filter(Boolean).length}/3 capas cargadas`;
}

iniciar();