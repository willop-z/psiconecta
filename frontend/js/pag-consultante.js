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

// Carga las áreas de interés desde la base de datos (ruta /api/areas del backend)
async function cargarAreas() {
    const select = document.getElementById("filtro-area");

    try {
        const respuesta = await fetch("/api/areas");
        if (!respuesta.ok) {
            throw new Error("El servidor respondió con un error");
        }
        const areas = await respuesta.json();

        // Crea una opción por cada área y la agrega al select
        areas.forEach(function (area) {
            const opcion = document.createElement("option");
            opcion.value = area.id;          // el id de la base de datos
            opcion.textContent = area.nombre; // el texto que ve el usuario
            select.appendChild(opcion);
        });
    } catch (error) {
        console.error("No se pudieron cargar las áreas:", error.message);
    }
}

// Se ejecuta al abrir la página
cargarAreas();