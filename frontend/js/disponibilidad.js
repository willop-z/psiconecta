const listaDisponibilidad = document.getElementById('lista-disponibilidad');
const mensajeVacio = document.getElementById('disponibilidad-vacia');
const formDisponibilidad = document.getElementById('form-disponibilidad');
const selectDia = document.getElementById('disp-dia');
const inputInicio = document.getElementById('disp-inicio');
const inputFin = document.getElementById('disp-fin');
const botonGuardar = document.getElementById('btn-guardar-ventana');
const botonCancelar = document.getElementById('btn-cancelar-edicion');

// Id de la ventana que se está editando (null = el formulario está en modo "agregar")
let ventanaEnEdicion = null;

const NOMBRES_DIA = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
};

// Cuántas citas de 70 minutos caben en una ventana
function citasQueCaben(horaInicio, horaFin) {
    const aMinutos = function(hora) {
        const partes = hora.split(':').map(Number);
        return partes[0] * 60 + partes[1];
    };
    return Math.floor((aMinutos(horaFin) - aMinutos(horaInicio)) / 70);
}

function volverAModoAgregar() {
    ventanaEnEdicion = null;
    inputInicio.value = '';
    inputFin.value = '';
    botonGuardar.textContent = 'Agregar';
    botonCancelar.classList.add('oculto');
}

function entrarModoEdicion(ventana) {
    ventanaEnEdicion = ventana.id;
    selectDia.value = ventana.dia;
    inputInicio.value = ventana.horaInicio;
    inputFin.value = ventana.horaFin;
    botonGuardar.textContent = 'Guardar cambios';
    botonCancelar.classList.remove('oculto');
    selectDia.focus();
}

// DELETE: elimina una ventana, con confirmación
async function eliminarVentana(ventana) {
    const descripcion = NOMBRES_DIA[ventana.dia].toLowerCase() + ' de ' + ventana.horaInicio + ' a ' + ventana.horaFin;
    if (!confirm('¿Eliminar la ventana del ' + descripcion + '?')) return;

    try {
        const respuesta = await fetch('/api/profesional/disponibilidad/' + ventana.id, {
            method: 'DELETE'
        });
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            alert(resultado.mensaje);
            return;
        }

        // Si justo se estaba editando esa ventana, el formulario vuelve a su estado normal
        if (ventanaEnEdicion === ventana.id) {
            volverAModoAgregar();
        }
        cargarDisponibilidad();
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    }
}

// READ: trae las ventanas y las dibuja en la lista
async function cargarDisponibilidad() {
    try {
        const respuesta = await fetch('/api/profesional/disponibilidad');
        if (!respuesta.ok) return;
        const ventanas = await respuesta.json();

        listaDisponibilidad.innerHTML = '';
        mensajeVacio.classList.toggle('oculto', ventanas.length > 0);

        ventanas.forEach(function(ventana) {
            const cupos = citasQueCaben(ventana.horaInicio, ventana.horaFin);

            const item = document.createElement('li');

            const texto = document.createElement('span');
            texto.textContent = NOMBRES_DIA[ventana.dia] + ': ' + ventana.horaInicio + ' – ' + ventana.horaFin +
                ' (' + cupos + (cupos === 1 ? ' cita)' : ' citas)');

            const acciones = document.createElement('div');
            acciones.className = 'disponibilidad-acciones';

            const botonEditar = document.createElement('button');
            botonEditar.type = 'button';
            botonEditar.className = 'btn-ventana-editar';
            botonEditar.textContent = 'Editar';
            botonEditar.addEventListener('click', function() {
                entrarModoEdicion(ventana);
            });

            const botonEliminar = document.createElement('button');
            botonEliminar.type = 'button';
            botonEliminar.className = 'btn-ventana-eliminar';
            botonEliminar.textContent = 'Eliminar';
            botonEliminar.addEventListener('click', function() {
                eliminarVentana(ventana);
            });

            acciones.appendChild(botonEditar);
            acciones.appendChild(botonEliminar);
            item.appendChild(texto);
            item.appendChild(acciones);
            listaDisponibilidad.appendChild(item);
        });
    } catch (error) {
        console.error('No se pudo cargar la disponibilidad:', error);
    }
}

// CREATE o UPDATE: el mismo formulario sirve para las dos cosas
formDisponibilidad.addEventListener('submit', async function(evento) {
    evento.preventDefault();

    const editando = ventanaEnEdicion !== null;
    const direccion = editando
        ? '/api/profesional/disponibilidad/' + ventanaEnEdicion
        : '/api/profesional/disponibilidad';

    try {
        const respuesta = await fetch(direccion, {
            method: editando ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dia: selectDia.value,
                horaInicio: inputInicio.value,
                horaFin: inputFin.value
            })
        });
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            alert(resultado.mensaje);
            return;
        }

        volverAModoAgregar();
        cargarDisponibilidad();
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    }
});

botonCancelar.addEventListener('click', volverAModoAgregar);

cargarDisponibilidad();