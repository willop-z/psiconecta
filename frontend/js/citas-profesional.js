const tablaCitas = document.getElementById('tabla-citas');
const cuerpoCitas = document.getElementById('citas-cuerpo');
const mensajeSinCitas = document.getElementById('citas-vacia');

const TEXTOS_CITA = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    cancelada: 'Cancelada'
};

async function cargarCitas() {
    try {
        const respuesta = await fetch('/api/profesional/citas');
        if (!respuesta.ok) return;
        const citas = await respuesta.json();

        cuerpoCitas.innerHTML = '';
        tablaCitas.classList.toggle('oculto', citas.length === 0);
        mensajeSinCitas.classList.toggle('oculto', citas.length > 0);

        citas.forEach(function(cita) {
            const fila = document.createElement('tr');

            [cita.consultante, cita.fecha, cita.hora].forEach(function(valor) {
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

            cuerpoCitas.appendChild(fila);
        });
    } catch (error) {
        console.error('No se pudieron cargar las citas:', error);
    }
}

cargarCitas();