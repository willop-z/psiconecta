const formLogin = document.getElementById('form-login');

// A qué página va cada rol después de iniciar sesión
const DESTINOS = {
    consultante: 'pag-consultante.html',
    psicologo: 'pag-profesional.html',
    admin: 'admin.html'
};

formLogin.addEventListener('submit', async function(evento) {
    evento.preventDefault();

    const correo = document.getElementById('correo').value;
    const contrasena = document.getElementById('contrasena').value;

    try {
        const respuesta = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, contrasena })
        });
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            alert(datos.mensaje);
            return;
        }

        window.location.href = DESTINOS[datos.rol];
    } catch (error) {
        alert('No se pudo conectar con el servidor');
    }
});