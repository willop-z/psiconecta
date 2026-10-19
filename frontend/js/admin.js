document.addEventListener("DOMContentLoaded", function () {
    const tablaCuerpo = document.querySelector(".admin-tabla tbody");

    // Formatear nombres de tipos de documento para que se lean adecuadamente
    function formatearTipoDoc(tipo) {
        const nombres = {
            "tarjeta_profesional": "Tarjeta profesional",
            "carta_universidad": "Carta de universidad",
            "aval_universidad": "Aval de universidad"
        };
        return nombres[tipo] || tipo;
    }

    // Cargar la lista desde la API
    async function cargarDocumentosPendientes() {
        try {
            const respuesta = await fetch("/api/admin/documentos-pendientes");
            const documentos = await respuesta.json();

            tablaCuerpo.innerHTML = ""; // Limpiar tabla de ejemplo

            if (documentos.length === 0) {
                tablaCuerpo.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center;">No hay documentos pendientes por revisar.</td>
                    </tr>
                `;
                return;
            }

            documentos.forEach(doc => {
                const fila = document.createElement("tr");

                // Asignar primera letra en mayúscula al tipo de psicólogo (Profesional / Practicante)
                const tipoPsicologo = doc.psicologo_tipo.charAt(0).toUpperCase() + doc.psicologo_tipo.slice(1);

                fila.innerHTML = `
                    <td>${doc.psicologo_nombre}</td>
                    <td>${tipoPsicologo}</td>
                    <td>
                        <a href="/uploads/${doc.archivo_url}" target="_blank" class="admin-ver-doc">
                            ${formatearTipoDoc(doc.documento_tipo)}
                        </a>
                    </td>
                    <td><span class="admin-estado pendiente">Pendiente</span></td>
                    <td>
                        <button class="btn-aprobar" data-id="${doc.documento_id}">Aprobar</button>
                        <button class="btn-rechazar" data-id="${doc.documento_id}">Rechazar</button>
                    </td>
                `;

                tablaCuerpo.appendChild(fila);
            });

            asignarEventosBotones();
        } catch (error) {
            console.error("Error al cargar lista:", error);
            tablaCuerpo.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: red;">Error al cargar las solicitudes.</td>
                </tr>
            `;
        }
    }

    // Asignar eventos de click a los botones Aprobar y Rechazar
    function asignarEventosBotones() {
        document.querySelectorAll(".btn-aprobar").forEach(boton => {
            boton.addEventListener("click", async function () {
                const id = this.getAttribute("data-id");
                if (confirm("¿Estás seguro de que deseas APROBAR este documento?")) {
                    await procesarAccion(id, "aprobar");
                }
            });
        });

        document.querySelectorAll(".btn-rechazar").forEach(boton => {
            boton.addEventListener("click", async function () {
                const id = this.getAttribute("data-id");
                if (confirm("¿Estás seguro de que deseas RECHAZAR este documento?")) {
                    await procesarAccion(id, "rechazar");
                }
            });
        });
    }

    // Enviar la petición PUT al backend
    async function procesarAccion(id, accion) {
        try {
            const respuesta = await fetch(`/api/admin/documentos/${id}/${accion}`, {
                method: "PUT"
            });

            const resultado = await respuesta.json();

            if (respuesta.ok) {
                alert(resultado.mensaje);
                cargarDocumentosPendientes(); // Recargar la lista automáticamente
            } else {
                alert("Error: " + resultado.mensaje);
            }
        } catch (error) {
            console.error(`Error al ${accion}:`, error);
            alert("No se pudo completar la acción.");
        }
    }

    cargarDocumentosPendientes();
});