document.addEventListener('DOMContentLoaded', () => {

    // --- Referencias a los elementos ---
    const form = document.getElementById('incidencia-form');
    const generateReportButton = document.getElementById('generate-report-btn');
    const downloadReportLink = document.getElementById('download-report-link');
    const loaderOverlay = document.getElementById('loader-overlay');
    const submitButton = document.getElementById('submit-form-btn');
    const openCameraButton = document.getElementById('open-camera-btn');
    const capturePhotoButton = document.getElementById('capture-photo-btn');
    const cameraStream = document.getElementById('camera-stream');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const hiddenImageInput = document.getElementById('imagenIncidencia');
    const cameraSelect = document.getElementById('camera-select'); // <-- AÑADIDO
    const context = cameraPreview.getContext('2d');
    let currentStream = null; // Renombrado de 'stream' a 'currentStream'
    let animationFrameId = null;

    // --- URL de tu Web App ---
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbzy1leyzn0NK4S-l25S4dHgb6YcM01peULVE0bX9qMToMgDgsvoUAJJ2RLocadiZSsmzg/exec';

    // ==== INICIAN NUEVAS FUNCIONES (de cargarProyectos) ====

    /**
     * Llama al servidor para obtener la lista de proyectos
     */
    const cargarProyectos = async () => {
      const proyectoSelect = document.getElementById('proyecto-select');
      
      try {
        const response = await fetch(webAppUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({ action: 'getProyectos' })
        });

        const result = await response.json();

        if (result.status === 'error') {
          throw new Error(result.message);
        }

        poblarSelectProyectos(result.proyectos);

      } catch (error) {
        console.error('Error al cargar proyectos:', error);
        proyectoSelect.innerHTML = `<option value="" disabled selected>Error al cargar proyectos</option>`;
        alert(`Error fatal al cargar proyectos: ${error.message}. La página no funcionará correctamente.`);
      }
    };

    /**
     * Rellena el <select> con los proyectos obtenidos
     */
    const poblarSelectProyectos = (proyectos) => {
      const proyectoSelect = document.getElementById('proyecto-select');
      
      proyectoSelect.innerHTML = ''; 

      if (!proyectos || proyectos.length === 0) {
        proyectoSelect.innerHTML = `<option value="" disabled selected>No se encontraron proyectos</option>`;
        return;
      }

      const defaultOption = document.createElement('option');
      defaultOption.value = "";
      defaultOption.textContent = "Selecciona un proyecto...";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      proyectoSelect.appendChild(defaultOption);

      proyectos.forEach(proyecto => {
        const option = document.createElement('option');
        option.value = proyecto.id;
        option.textContent = proyecto.nombre;
        proyectoSelect.appendChild(option);
      });
    };
    // ==== TERMINAN NUEVAS FUNCIONES ====


    // --- Funciones para el loader (TU CÓDIGO ORIGINAL) ---
    const showLoader = (message = 'Cargando...') => {
        const loaderMessage = loaderOverlay.querySelector('p');
        if (loaderMessage) {
            loaderMessage.textContent = message;
        }
        loaderOverlay.classList.remove('hidden'); // Usa .hidden
    };
    const hideLoader = () => {
        loaderOverlay.classList.add('hidden'); // Usa .hidden
    };

    // --- Lógica de la cámara (REESTRUCTURADA) ---

    /**
     * Detiene el stream de video actual y el loop de dibujo
     */
    const stopCurrentStream = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    /**
     * Inicia un nuevo stream de video con las constraints (restricciones) dadas
     */
    const startStream = async (constraints) => {
        stopCurrentStream(); // Detiene cualquier stream anterior

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream.srcObject = currentStream;

            cameraStream.onloadedmetadata = () => {
                const containerWidth = cameraPreview.parentElement.offsetWidth;
                cameraPreview.width = containerWidth;
                cameraPreview.height = containerWidth;
                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                startDrawingLoop(); // Tu función de loop de canvas
                openCameraButton.classList.add('hidden');
                capturePhotoButton.classList.remove('hidden');
                
                // Después de que el stream es exitoso, actualiza la lista de cámaras
                updateCameraList();
            };

        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert(`Error al iniciar la cámara: ${error.message}. ¿Diste permisos?`);
            // Si falla, resetea la UI de la cámara
            resetCameraUI();
        }
    };

    /**
     * Obtiene y muestra la lista de cámaras en el <select>
     */
    const updateCameraList = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            // Si hay 1 o menos cámaras, no mostramos el selector
            if (videoDevices.length <= 1) {
                cameraSelect.classList.add('hidden');
                return; 
            }

            // Guarda el deviceId actual para pre-seleccionarlo
            const currentCameraId = currentStream?.getVideoTracks()[0]?.getSettings()?.deviceId;

            cameraSelect.innerHTML = ''; // Limpia opciones
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                // Si la etiqueta está vacía (común antes del permiso), usa un nombre genérico
                option.text = device.label || `Cámara ${videoDevices.indexOf(device) + 1}`;
                if (device.deviceId === currentCameraId) {
                    option.selected = true;
                }
                cameraSelect.appendChild(option);
            });
            cameraSelect.classList.remove('hidden'); // Muestra el selector

        } catch (err) {
            console.error('Error enumerando dispositivos:', err);
            cameraSelect.classList.add('hidden'); // Oculta si hay error
        }
    };

    /**
     * (Función original modificada) Inicia la cámara por primera vez
     */
    const openCamera = async () => {
        // 1. Intenta con la cámara trasera (environment)
        let constraints = { video: { facingMode: 'environment' } };
        
        try {
            // Prueba si 'environment' es soportado
            // Esto es solo una prueba para ver si falla rápido, el stream real se inicia en startStream
            const testStream = await navigator.mediaDevices.getUserMedia(constraints);
            testStream.getTracks().forEach(track => track.stop()); // Lo detenemos de inmediato

            await startStream(constraints); // Inicia el stream real con 'environment'
        } catch (err) {
            // 2. Si falla (común en PC o si el móvil no lo soporta), usa la cámara por defecto
            console.warn("Fallo al obtener 'environment', probando con 'video: true'");
            constraints = { video: true };
            await startStream(constraints); // Inicia con cualquier cámara que encuentre
        }
    };

    /**
     * Resetea solo la UI de la cámara, sin tocar el formulario
     */
    const resetCameraUI = () => {
        stopCurrentStream();
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'La cámara está apagada';
        capturePhotoButton.classList.add('hidden');
        capturePhotoButton.textContent = 'Capturar Foto';
        capturePhotoButton.disabled = false;
        capturePhotoButton.classList.remove('is-captured');
        openCameraButton.classList.remove('hidden');
        hiddenImageInput.value = '';
        cameraSelect.classList.add('hidden'); // Oculta el selector
    };


    // (Tu startDrawingLoop se queda igual)
    const startDrawingLoop = () => {
        const draw = () => {
            const videoWidth = cameraStream.videoWidth;
            const videoHeight = cameraStream.videoHeight;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;
            context.drawImage(cameraStream, x, y, size, size, 0, 0, cameraPreview.width, cameraPreview.height);
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    // (Modificamos capturePhoto para usar stopCurrentStream)
    const capturePhoto = () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
        hiddenImageInput.value = imageDataUrl;
        
        stopCurrentStream(); // <-- CAMBIO AQUÍ
        
        capturePhotoButton.textContent = 'Foto Capturada ✔';
        
        capturePhotoButton.classList.add('is-captured'); // En lugar de 'bg-green-600'
        
        capturePhotoButton.disabled = true;
        cameraSelect.classList.add('hidden'); // <-- AÑADIDO: Oculta el selector al capturar
    };
    
    // --- Lógica de envío (AJUSTADA para el reporte) ---
    const handleFormSubmit = async (event) => {
        event.preventDefault();
        if (!hiddenImageInput.value) { alert('Por favor, captura una foto de evidencia.'); return; }
        
        const payload = Object.fromEntries(new FormData(form));
        payload.imagenBase64 = payload.imagenIncidencia;
        delete payload.imagenIncidencia;
        
        showLoader('Registrando incidencia...');
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow', 
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8' 
                },
                body: JSON.stringify({ action: 'registrarIncidencia', payload: payload })
            });

            const result = await response.json();
            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert(`¡Incidencia registrada con éxito! ID: ${result.newId}`);
            resetForm();
            
        } catch (error) {
            alert(`Hubo un error al registrar la incidencia: ${error.message}`);
        } finally {
            hideLoader();
        }
    };
    
    // --- Lógica de reporte (AJUSTADA) ---
    const handleGenerateReport = async () => {
        // Obtenemos el ID del proyecto seleccionado
        const proyectoSelect = document.getElementById('proyecto-select');
        const proyectoSheetId = proyectoSelect.value;
        
        if (!proyectoSheetId) {
            alert("Por favor, selecciona un proyecto antes de generar un reporte.");
            return;
        }

        showLoader('Generando reporte en Drive...');
        downloadReportLink.classList.add('hidden');
        
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({ 
                    action: 'generarReporte',
                    payload: { proyectoSheetId: proyectoSheetId } // Enviamos el ID
                })
            });

            const result = await response.json(); 

            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert('Reporte generado. ¡Ya puedes descargarlo!');
            
            downloadReportLink.href = result.downloadUrl; 
            downloadReportLink.target = "_blank";
            downloadReportLink.classList.remove('hidden');

        } catch (error) {
            alert(`Hubo un error al generar el reporte: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    // --- resetForm (TU CÓDIGO ORIGINAL, 1 CAMBIO) ---
    const resetForm = () => {
        form.reset();
        
        // --- CAMBIO AQUÍ ---
        // Llamamos a la nueva función que resetea solo la cámara
        resetCameraUI();
        // ------------------

        // Ponemos el <select> de proyecto en el valor por defecto
        document.getElementById('proyecto-select').selectedIndex = 0;
    };

    // --- Asignar eventos ---
    
    // Ahora que todas las funciones están definidas, cargamos los proyectos.
    cargarProyectos();

    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);

    // ==== INICIO DE NUEVO EVENTO ====
    // Añadimos el listener para el CAMBIO de cámara
    cameraSelect.addEventListener('change', (e) => {
        const newCameraId = e.target.value;
        if (newCameraId) {
            // Inicia un nuevo stream con el ID exacto del dispositivo seleccionado
            startStream({ video: { deviceId: { exact: newCameraId } } });
        }
    });
    // ==== FIN DE NUEVO EVENTO ====
});