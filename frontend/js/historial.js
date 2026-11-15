const tablaHistorial = document.getElementById('tabla-historial');
const cuerpoHistorial = document.getElementById('historial-cuerpo');
const mensajeHistorialVacio = document.getElementById('historial-vacio');

const TEXTOS_CITA = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    cancelada: 'Cancelada'
};

// Convierte 4 en ★★★★☆ (o un guion si todavía no hay calificación)
function textoCalificacion(calificacion) {
    if (calificacion === null) return '—';
    return '★'.repeat(calificacion) + '☆'.repeat(5 - calificacion);
}

async function cargarHistorial() {
    try {
        const respuesta = await fetch('/api/consultante/citas');
        if (!respuesta.ok) return;
        const citas = await respuesta.json();

        cuerpoHistorial.innerHTML = '';
        tablaHistorial.classList.toggle('oculto', citas.length === 0);
        mensajeHistorialVacio.classList.toggle('oculto', citas.length > 0);

        citas.forEach(function(cita) {
            const fila = document.createElement('tr');

            [cita.psicologo, cita.fecha, cita.hora].forEach(function(valor) {
                const celda = document.createElement('td');
                celda.textContent = valor;
                fila.appendChild(celda);
            });

            const celdaEstado = document.createElement('td');
            const etiqueta = document.createElement('span');
            etiqueta.className = 'cita-estado ' + cita.estado;
            etiqueta.textContent = TEXTOS_CITA[cita.estado];
            celdaEstado.appendChild(etiqueta);
            fila.appendChild(celdaEstado);

            const celdaCalificacion = document.createElement('td');
            celdaCalificacion.textContent = textoCalificacion(cita.calificacion);
            fila.appendChild(celdaCalificacion);

            cuerpoHistorial.appendChild(fila);
        });
    } catch (error) {
        console.error('No se pudo cargar el historial:', error);
    }
}

cargarHistorial();