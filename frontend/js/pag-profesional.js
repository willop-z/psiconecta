const estadoCuenta = document.getElementById('estado-cuenta');
const panelAprobado = document.getElementById('panel-aprobado');
const avisoPendiente = document.getElementById('aviso-pendiente');
const avisoRechazado = document.getElementById('aviso-rechazado');

const formPerfil = document.getElementById('form-perfil');
const inputAnios = document.getElementById('anios-experiencia');
const inputEspecialidad = document.getElementById('especialidad');
const inputBiografia = document.getElementById('biografia');
const listaAreas = document.getElementById('lista-areas');

const TEXTOS_ESTADO = {
    pendiente: 'Cuenta en revisión',
    aprobado: 'Cuenta verificada',
    rechazado: 'Cuenta rechazada'
};

// Dibuja una casilla por cada área del catálogo, marcando las que ya eligió
async function cargarAreas(areasSeleccionadas) {
    const respuesta = await fetch('/api/areas');
    if (!respuesta.ok) return;
    const areas = await respuesta.json();

    listaAreas.innerHTML = '';
    areas.forEach(function(area) {
        const etiqueta = document.createElement('label');
        etiqueta.className = 'perfil-area-opcion';

        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = area.id;
        casilla.checked = areasSeleccionadas.includes(area.id);

        const nombre = document.createElement('span');
        nombre.textContent = area.nombre;

        etiqueta.appendChild(casilla);
        etiqueta.appendChild(nombre);
        listaAreas.appendChild(etiqueta);
    });
}

async function cargarPerfil() {
    try {
        const respuesta = await fetch('/api/profesional/perfil');
        if (!respuesta.ok) return;

        const perfil = await respuesta.json();
        const estado = perfil.estado_verificacion;

        estadoCuenta.textContent = TEXTOS_ESTADO[estado];
        estadoCuenta.className = 'psicologo-estado ' + estado;

        panelAprobado.classList.toggle('oculto', estado !== 'aprobado');
        avisoPendiente.classList.toggle('oculto', estado !== 'pendiente');
        avisoRechazado.classList.toggle('oculto', estado !== 'rechazado');

        // Rellena el formulario con lo que ya está guardado
        inputAnios.value = perfil.anios_experiencia ?? '';
        inputEspecialidad.value = perfil.especialidad ?? '';
        inputBiografia.value = perfil.biografia ?? '';
        await cargarAreas(perfil.areas || []);
    } catch (error) {
        console.error('No se pudo cargar el perfil:', error);
    }
}

formPerfil.addEventListener('submit', async function(evento) {
    evento.preventDefault();

    const areasElegidas = Array.from(listaAreas.querySelectorAll('input:checked'))
        .map(function(casilla) { return Number(casilla.value); });

    try {
        const respuesta = await fetch('/api/profesional/perfil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aniosExperiencia: inputAnios.value,
                especialidad: inputEspecialidad.value,
                biografia: inputBiografia.value,
                areas: areasElegidas
            })
        });
        const resultado = await respuesta.json();
        alert(resultado.mensaje);
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    }
});

cargarPerfil();