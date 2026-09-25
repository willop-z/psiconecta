const formLogin = document.getElementById('form-login');

const CREDENCIALES_PRUEBA = {
    correo: 'consultante@correo.com',
    contrasena: '123'
};

formLogin.addEventListener('submit', function(evento) {
    evento.preventDefault();

    const correoIngresado = document.getElementById('correo').value;
    const contrasenaIngresada = document.getElementById('contrasena').value;

    if (correoIngresado === CREDENCIALES_PRUEBA.correo && contrasenaIngresada === CREDENCIALES_PRUEBA.contrasena) {
        window.location.href = 'busqueda.html';
    } else {
        alert('Correo o contraseña incorrectos');
    }
});