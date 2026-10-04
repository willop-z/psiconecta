const formLogin = document.getElementById('form-login');

const USUARIOS_PRUEBA = [
    { correo: 'consultante@correo.com', contrasena: '123', destino: 'pag-consultante.html' },
    { correo: 'profesional@correo.com', contrasena: '123', destino: 'pag-profesional.html' },
    { correo: 'admin@correo.com', contrasena: '123', destino: 'admin.html' }
];

formLogin.addEventListener('submit', function(evento) {
    evento.preventDefault();

    const correoIngresado = document.getElementById('correo').value;
    const contrasenaIngresada = document.getElementById('contrasena').value;

    const usuarioEncontrado = USUARIOS_PRUEBA.find(function(usuario) {
        return usuario.correo === correoIngresado && usuario.contrasena === contrasenaIngresada;
    });

    if (usuarioEncontrado) {
        window.location.href = usuarioEncontrado.destino;
    } else {
        alert('Correo o contraseña incorrectos');
    }
});