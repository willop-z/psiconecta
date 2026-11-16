const tablaHistorial = document.getElementById('tabla-historial');
const cuerpoHistorial = document.getElementById('historial-cuerpo');
const mensajeHistorialVacio = document.getElementById('historial-vacio');

const panelCalificar = document.getElementById('panel-calificar');
const tituloCalificar = document.getElementById('calificar-titulo');
const contenedorEstrellas = document.getElementById('calificar-estrellas');
const inputComentario = document.getElementById('calificar-comentario');
const botonEnviarCalificacion = document.getElementById('btn-enviar-calificacion');
const botonCancelarCalificacion = document.getElementById('btn-cancelar-calificacion');

const TEXTOS_CITA = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    cancelada: 'Cancelada'
};

let citaACalificar = null;   // la cita que se está calificando
let estrellasElegidas = 0;   // 0 = todavía no eligió

// ---------------------------------------------------------------------------- Estrellas
// Pinta las primeras "estrellasElegidas" estrellas como llenas
function pintarEstrellas() {
    contenedorEstrellas.querySelectorAll('button').forEach(function(boton, posicion) {
        const llena = posicion < estrellasElegidas;
        boton.textContent = llena ? '★' : '☆';
        boton.classList.toggle('llena', llena);
        boton.setAttribute('aria-pressed', llena ? 'true' : 'false');
    });
}

function crearEstrellas() {
    for (let valor = 1; valor <= 5; valor++) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn-estrella';
        boton.setAttribute('aria-label', valor + (valor === 1 ? ' estrella' : ' estrellas'));
        boton.addEventListener('click', function() {
            estrellasElegidas = valor;
            pintarEstrellas();
        });
        contenedorEstrellas.appendChild(boton);
    }
    pintarEstrellas();
}

// ---------------------------------------------------------------------------- Panel de calificar
function cerrarPanelCalificar() {
    citaACalificar = null;
    estrellasElegidas = 0;
    inputComentario.value = '';
    pintarEstrellas();
    panelCalificar.classList.add('oculto');
}

function abrirPanelCalificar(cita) {
    citaACalificar = cita;
    estrellasElegidas = 0;
    inputComentario.value = '';
    pintarEstrellas();
    tituloCalificar.textContent = 'Califica tu cita con ' + cita.psicologo + ' del ' + cita.fecha;
    panelCalificar.classList.remove('oculto');
    panelCalificar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function enviarCalificacion() {
    if (!citaACalificar) return;
    if (estrellasElegidas === 0) {
        alert('Elige de 1 a 5 estrellas.');
        return;
    }

    botonEnviarCalificacion.disabled = true;  // evita enviar dos veces con un doble clic
    try {
        const respuesta = await fetch('/api/consultante/citas/' + citaACalificar.id + '/calificacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calificacion: estrellasElegidas,
                comentario: inputComentario.value
            })
        });
        const resultado = await respuesta.json();
        alert(resultado.mensaje);

        // Se cierra si se guardó o si la cita ya no se puede calificar; ante un error de datos, se deja abierto
        if (respuesta.ok || respuesta.status === 409 || respuesta.status === 404) {
            cerrarPanelCalificar();
        }
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    } finally {
        botonEnviarCalificacion.disabled = false;
    }

    cargarHistorial();
}

// ---------------------------------------------------------------------------- Historial
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

            // Calificación: las estrellas si ya calificó, un botón si puede calificar, o un guion
            const celdaCalificacion = document.createElement('td');
            if (cita.calificacion !== null) {
                celdaCalificacion.textContent = '★'.repeat(cita.calificacion) + '☆'.repeat(5 - cita.calificacion);
                celdaCalificacion.setAttribute('aria-label', 'Calificación: ' + cita.calificacion + ' de 5');
            } else if (cita.estado === 'realizada') {
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'btn-calificar';
                boton.textContent = 'Calificar';
                boton.addEventListener('click', function() {
                    abrirPanelCalificar(cita);
                });
                celdaCalificacion.appendChild(boton);
            } else {
                celdaCalificacion.textContent = '—';
            }
            fila.appendChild(celdaCalificacion);

            cuerpoHistorial.appendChild(fila);
        });
    } catch (error) {
        console.error('No se pudo cargar el historial:', error);
    }
}

botonEnviarCalificacion.addEventListener('click', enviarCalificacion);
botonCancelarCalificacion.addEventListener('click', cerrarPanelCalificar);

crearEstrellas();
cargarHistorial();