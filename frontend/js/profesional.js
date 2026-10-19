const form = document.getElementById('form-registro-profesional');
const radios = document.querySelectorAll('input[name="tipo"]');
const bloqueProfesional = document.getElementById('documentos-profesional');
const bloquePracticante = document.getElementById('documentos-practicante');
const docTarjeta = document.getElementById('doc-tarjeta');
const docCarta = document.getElementById('doc-carta');
const docAval = document.getElementById('doc-aval');

// Muestra solo los documentos que corresponden al tipo elegido
radios.forEach(function(radio) {
    radio.addEventListener('change', function() {
        const esProfesional = radio.value === 'profesional';

        bloqueProfesional.classList.toggle('oculto', !esProfesional);
        bloquePracticante.classList.toggle('oculto', esProfesional);

        docTarjeta.required = esProfesional;
        docCarta.required = !esProfesional;
        docAval.required = !esProfesional;

        // Limpia los archivos del tipo que ya no aplica
        if (esProfesional) {
            docCarta.value = '';
            docAval.value = '';
        } else {
            docTarjeta.value = '';
        }
    });
});

form.addEventListener('submit', async function(evento) {
    evento.preventDefault();

    const tipo = document.querySelector('input[name="tipo"]:checked').value;

    const datos = new FormData();
    datos.append('nombre', document.getElementById('nombre').value);
    datos.append('correo', document.getElementById('correo').value);
    datos.append('contrasena', document.getElementById('contrasena').value);
    datos.append('confirmarContrasena', document.getElementById('confirmar-contrasena').value);
    datos.append('tipo', tipo);

    if (tipo === 'profesional') {
        datos.append('docTarjeta', docTarjeta.files[0]);
    } else {
        datos.append('docCarta', docCarta.files[0]);
        datos.append('docAval', docAval.files[0]);
    }

    try {
        const respuesta = await fetch('/api/registro/psicologo', {
            method: 'POST',
            body: datos
        });
        const resultado = await respuesta.json();

        alert(resultado.mensaje);
        if (respuesta.ok) {
            window.location.href = 'login.html';
        }
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    }
});