const resumenCalificaciones = document.getElementById('calificaciones-resumen');
const listaComentarios = document.getElementById('calificaciones-comentarios');

async function cargarCalificaciones() {
    try {
        const respuesta = await fetch('/api/profesional/calificaciones');
        if (!respuesta.ok) return;
        const calificaciones = await respuesta.json();

        listaComentarios.innerHTML = '';

        if (calificaciones.total === 0) {
            resumenCalificaciones.textContent = 'Aún no tienes calificaciones.';
            return;
        }

        const promedio = String(calificaciones.promedio).replace('.', ',');
        resumenCalificaciones.textContent = '★ ' + promedio + ' de 5 · ' + calificaciones.total +
            (calificaciones.total === 1 ? ' calificación' : ' calificaciones');

        calificaciones.comentarios.forEach(function(comentario) {
            const item = document.createElement('li');

            const encabezado = document.createElement('span');
            encabezado.className = 'comentario-encabezado';
            encabezado.textContent = '★'.repeat(comentario.calificacion) +
                '☆'.repeat(5 - comentario.calificacion) + ' · ' + comentario.mes;

            const texto = document.createElement('p');
            texto.textContent = comentario.comentario;

            item.appendChild(encabezado);
            item.appendChild(texto);
            listaComentarios.appendChild(item);
        });
    } catch (error) {
        console.error('No se pudieron cargar las calificaciones:', error);
    }
}

cargarCalificaciones();