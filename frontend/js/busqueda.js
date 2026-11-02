const filtroTipo = document.getElementById('filtro-tipo');
const filtroArea = document.getElementById('filtro-area');
const contenedorResultados = document.getElementById('busqueda-resultados');
const mensajeSinResultados = document.getElementById('busqueda-vacia');

const TEXTOS_TIPO = {
    profesional: 'Profesional graduado',
    practicante: 'Practicante en formación'
};

// Llena el selector de áreas con las del catálogo
async function cargarAreas() {
    try {
        const respuesta = await fetch('/api/areas');
        if (!respuesta.ok) return;
        const areas = await respuesta.json();

        areas.forEach(function(area) {
            const opcion = document.createElement('option');
            opcion.value = area.id;
            opcion.textContent = area.nombre;
            filtroArea.appendChild(opcion);
        });
    } catch (error) {
        console.error('No se pudieron cargar las áreas:', error);
    }
}

// Arma la tarjeta de un psicólogo
function crearTarjeta(psicologo) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'psicologo-card';

    const nombre = document.createElement('h3');
    nombre.textContent = psicologo.nombre;

    const tipo = document.createElement('span');
    tipo.className = 'psicologo-tipo';
    tipo.textContent = TEXTOS_TIPO[psicologo.tipo];

    const areas = document.createElement('div');
    areas.className = 'psicologo-areas';
    psicologo.areas.forEach(function(nombreArea) {
        const etiqueta = document.createElement('span');
        etiqueta.className = 'areas-item';
        etiqueta.textContent = nombreArea;
        areas.appendChild(etiqueta);
    });

    const enlace = document.createElement('a');
    enlace.className = 'btn-ver-perfil';
    enlace.href = 'pag-perfil.html?id=' + psicologo.id;
    enlace.textContent = 'Ver perfil';

    tarjeta.appendChild(nombre);
    tarjeta.appendChild(tipo);
    tarjeta.appendChild(areas);
    tarjeta.appendChild(enlace);
    return tarjeta;
}

// Pide al servidor los psicólogos que cumplen los filtros y dibuja las tarjetas
async function buscarPsicologos() {
    const parametros = new URLSearchParams();
    if (filtroTipo.value) parametros.set('tipo', filtroTipo.value);
    if (filtroArea.value) parametros.set('area', filtroArea.value);

    try {
        const respuesta = await fetch('/api/psicologos?' + parametros.toString());
        if (!respuesta.ok) return;
        const psicologos = await respuesta.json();

        contenedorResultados.innerHTML = '';
        mensajeSinResultados.classList.toggle('oculto', psicologos.length > 0);

        psicologos.forEach(function(psicologo) {
            contenedorResultados.appendChild(crearTarjeta(psicologo));
        });
    } catch (error) {
        console.error('No se pudo realizar la búsqueda:', error);
    }
}

// Cada vez que cambia un filtro, se vuelve a buscar
filtroTipo.addEventListener('change', buscarPsicologos);
filtroArea.addEventListener('change', buscarPsicologos);

cargarAreas();
buscarPsicologos();