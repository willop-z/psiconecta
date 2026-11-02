const parametros = new URLSearchParams(window.location.search);
const idPsicologo = parametros.get('id');

const errorPerfil = document.getElementById('perfil-error');
const contenidoPerfil = document.getElementById('perfil-contenido');
const nombrePerfil = document.getElementById('perfil-nombre');
const tipoPerfil = document.getElementById('perfil-tipo');
const areasPerfil = document.getElementById('perfil-areas');
const detallePerfil = document.getElementById('perfil-detalle');
const experienciaPerfil = document.getElementById('perfil-experiencia');
const especialidadPerfil = document.getElementById('perfil-especialidad');
const biografiaBloque = document.getElementById('perfil-biografia-bloque');
const biografiaPerfil = document.getElementById('perfil-biografia');
const listaHorarios = document.getElementById('perfil-horarios');
const sinHorarios = document.getElementById('perfil-sin-horarios');

const TEXTOS_TIPO = {
    profesional: 'Profesional graduado',
    practicante: 'Practicante en formación'
};

const NOMBRES_DIA = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
};

function mostrarError() {
    errorPerfil.classList.remove('oculto');
    contenidoPerfil.classList.add('oculto');
}

async function cargarPerfil() {
    if (!idPsicologo) {
        mostrarError();
        return;
    }

    try {
        const respuesta = await fetch('/api/psicologos/' + encodeURIComponent(idPsicologo));
        if (!respuesta.ok) {
            mostrarError();
            return;
        }
        const perfil = await respuesta.json();

        nombrePerfil.textContent = perfil.nombre;
        tipoPerfil.textContent = TEXTOS_TIPO[perfil.tipo];

        perfil.areas.forEach(function(nombreArea) {
            const etiqueta = document.createElement('span');
            etiqueta.className = 'areas-item';
            etiqueta.textContent = nombreArea;
            areasPerfil.appendChild(etiqueta);
        });

        //---------------------------- la info del profesional, se muestra si hay algún dato
        const hayExperiencia = perfil.aniosExperiencia !== null;
        const hayEspecialidad = Boolean(perfil.especialidad);
        const hayBiografia = Boolean(perfil.biografia);

        if (hayExperiencia) {
            experienciaPerfil.textContent = 'Experiencia: ' + perfil.aniosExperiencia +
                (perfil.aniosExperiencia === 1 ? ' año' : ' años');
            experienciaPerfil.classList.remove('oculto');
        }
        if (hayEspecialidad) {
            especialidadPerfil.textContent = 'Especialidad: ' + perfil.especialidad;
            especialidadPerfil.classList.remove('oculto');
        }
        if (hayBiografia) {
            biografiaPerfil.textContent = perfil.biografia;
            biografiaBloque.classList.remove('oculto');
        }
        detallePerfil.classList.toggle('oculto', !(hayExperiencia || hayEspecialidad || hayBiografia));

        // ---------------------------------------------------------- Horarios de atención
        sinHorarios.classList.toggle('oculto', perfil.horarios.length > 0);
        perfil.horarios.forEach(function(ventana) {
            const item = document.createElement('li');
            item.textContent = NOMBRES_DIA[ventana.dia] + ': ' + ventana.horaInicio + ' – ' + ventana.horaFin;
            listaHorarios.appendChild(item);
        });

        contenidoPerfil.classList.remove('oculto');
    } catch (error) {
        console.error('No se pudo cargar el perfil:', error);
        mostrarError();
    }
}

// --------------------------------------------------------------------- Agendar: horarios libres
const inputFecha = document.getElementById('agenda-fecha');
const mensajeAgenda = document.getElementById('agenda-mensaje');
const contenedorHorarios = document.getElementById('agenda-horarios');

const DIAS_ANTICIPACION = 30;

// Convierte una fecha en "AAAA-MM-DD" usando la hora local
function aTextoFecha(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return anio + '-' + mes + '-' + dia;
}

// El selector solo deja elegir desde hoy hasta dentro de 30 días
const hoy = new Date();
const limite = new Date();
limite.setDate(limite.getDate() + DIAS_ANTICIPACION);
inputFecha.min = aTextoFecha(hoy);
inputFecha.max = aTextoFecha(limite);

function mostrarMensajeAgenda(texto) {
    mensajeAgenda.textContent = texto;
    mensajeAgenda.classList.remove('oculto');
}

async function cargarHorarios() {
    contenedorHorarios.innerHTML = '';
    mensajeAgenda.classList.add('oculto');
    if (!inputFecha.value) return;

    try {
        const respuesta = await fetch(
            '/api/psicologos/' + encodeURIComponent(idPsicologo) + '/horarios?fecha=' + inputFecha.value
        );
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mostrarMensajeAgenda(resultado.mensaje);
            return;
        }
        if (resultado.length === 0) {
            mostrarMensajeAgenda('No hay horarios libres para esa fecha.');
            return;
        }

        resultado.forEach(function(hora) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'btn-horario';
            boton.textContent = hora;
            contenedorHorarios.appendChild(boton);
        });
    } catch (error) {
        mostrarMensajeAgenda('No se pudo conectar con el servidor.');
    }
}

inputFecha.addEventListener('change', cargarHorarios);

cargarPerfil();