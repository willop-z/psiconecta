const botonesTab = document.querySelectorAll('.tab-btn');
const paneles = document.querySelectorAll('.tab-panel');

botonesTab.forEach(function(boton) {
    boton.addEventListener('click', function() {
        const destino = boton.getAttribute('data-tab');

        botonesTab.forEach(function(b) {
            b.classList.remove('activo');
        });
        boton.classList.add('activo');

        paneles.forEach(function(panel) {
            panel.classList.add('oculto');
        });
        document.getElementById('tab-' + destino).classList.remove('oculto');
    });
});