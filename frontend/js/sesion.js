async function mostrarNombreUsuario() {
    try {
        const respuesta = await fetch('/api/sesion');
        if (!respuesta.ok) return;

        const usuario = await respuesta.json();
        document.querySelectorAll('.nombre-usuario').forEach(function(elemento) {
            elemento.textContent = usuario.nombre;
        });
    } catch (error) {
        console.error('No se pudo obtener la sesión:', error);
    }
}

mostrarNombreUsuario();