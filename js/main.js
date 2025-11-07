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
    const cameraSelect = document.getElementById('camera-select');
    const context = cameraPreview.getContext('2d');
    let currentStream = null;
    let animationFrameId = null;

    // --- URL de tu Web App ---
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbzy1leyzn0NK4S-l25S4dHgb6YcM01peULVE0bX9qMToMgDgsvoUAJJ2RLocadiZSsmzg/exec';

    // --- Lógica de Cargar Proyectos ---
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
    
    // --- Funciones para el loader ---
    const showLoader = (message = 'Cargando...') => {
        const loaderMessage = loaderOverlay.querySelector('p');
        if (loaderMessage) {
            loaderMessage.textContent = message;
        }
        loaderOverlay.classList.remove('hidden');
    };
    const hideLoader = () => {
        loaderOverlay.classList.add('hidden');
    };

    // --- Lógica de la cámara (REESTRUCTURADA) ---

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

    const startStream = async (constraints) => {
        stopCurrentStream(); 

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream.srcObject = currentStream;

            cameraStream.onloadedmetadata = () => {
                const containerWidth = cameraPreview.parentElement.offsetWidth;
                // El canvas de VISTA PREVIA sigue usando el tamaño del contenedor
                cameraPreview.width = containerWidth;
                cameraPreview.height = containerWidth;
                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                startDrawingLoop(); 
                openCameraButton.classList.add('hidden');
                capturePhotoButton.classList.remove('hidden');
                
                updateCameraList();
            };

        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert(`Error al iniciar la cámara: ${error.message}. ¿Diste permisos?`);
            resetCameraUI();
        }
    };

    const updateCameraList = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length <= 1) {
                cameraSelect.classList.add('hidden');
                return; 
            }

            const currentCameraId = currentStream?.getVideoTracks()[0]?.getSettings()?.deviceId;

            cameraSelect.innerHTML = '';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Cámara ${videoDevices.indexOf(device) + 1}`;
                if (device.deviceId === currentCameraId) {
                    option.selected = true;
                }
                cameraSelect.appendChild(option);
            });
            cameraSelect.classList.remove('hidden');

        } catch (err) {
            console.error('Error enumerando dispositivos:', err);
            cameraSelect.classList.add('hidden');
        }
    };

    /**
     * (Función original modificada) Inicia la cámara por primera vez
     */
    const openCamera = async () => {

        // Verificar si el navegador soporta mediaDevices y es un contexto seguro
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("navigator.mediaDevices.getUserMedia no está disponible.");
            alert("No se puede acceder a la cámara. Asegúrate de que estás en una conexión segura (https://) y has concedido permisos.");
            return; // Detener la ejecución
        }


        // ==== INICIO DE CAMBIOS: Solicitud de Alta Resolución ====
        
        // 1. Definir constraints de alta resolución
        const constraints_hd_rear = { 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 }, // Pedir 1920x1080 (Full HD)
                height: { ideal: 1080 }
            } 
        };
        
        try {
            // 2. Intentar abrir la cámara trasera en alta resolución
            await startStream(constraints_hd_rear);
        } catch (err) {
            console.warn("Fallo al obtener 'environment' en HD. Probando frontal/default en HD.");
            
            // 3. Si falla, probar la cámara frontal (o default) en alta resolución
            const constraints_hd_front = { 
                video: { 
                    width: { ideal: 1920 }, 
                    height: { ideal: 1080 }
                } 
            };
            
            try {
                await startStream(constraints_hd_front);
            } catch (err2) {
                // 4. Si todo falla, pedir la cámara por defecto (baja res)
                console.warn("Fallaron las cámaras HD. Probando 'video: true' (baja res)");
                await startStream({ video: true }); 
            }
        }
        // ==== FIN DE CAMBIOS ====
    };

    const resetCameraUI = () => {
        stopCurrentStream();
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);
        
        // --- INICIO DE CAMBIO ---
        // Devolver el canvas al tamaño del contenedor (por si se cambió en la captura)
        const containerWidth = cameraPreview.parentElement.offsetWidth;
        cameraPreview.width = containerWidth || 300; // 300 como fallback
        cameraPreview.height = containerWidth || 300;
        // --- FIN DE CAMBIO ---
        
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'La cámara está apagada';
        capturePhotoButton.classList.add('hidden');
        capturePhotoButton.textContent = 'Capturar Foto';
        capturePhotoButton.disabled = false;
        capturePhotoButton.classList.remove('is-captured');
        openCameraButton.classList.remove('hidden');
        hiddenImageInput.value = '';
        cameraSelect.classList.add('hidden'); 
    };


    // Dibuja el video en el canvas de VISTA PREVIA (baja res, estirado)
    const startDrawingLoop = () => {
        const draw = () => {
            if (!currentStream) return; // Detener si el stream ya no existe
            const videoWidth = cameraStream.videoWidth;
            const videoHeight = cameraStream.videoHeight;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;
            // Dibuja el "cuadrado" del video en el canvas de vista previa
            context.drawImage(cameraStream, x, y, size, size, 0, 0, cameraPreview.width, cameraPreview.height);
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    /**
     * (Función modificada) Captura la foto en alta resolución
     */
    const capturePhoto = () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

        // ==== INICIO DE CAMBIOS: Captura en Alta Resolución ====
        
        // 1. Obtener dimensiones NATIVAS del video (ej. 1920x1080)
        const videoWidth = cameraStream.videoWidth;
        const videoHeight = cameraStream.videoHeight;

        // 2. Calcular el corte cuadrado (misma lógica que el preview, pero con números grandes)
        const size = Math.min(videoWidth, videoHeight); // ej. 1080
        const x = (videoWidth - size) / 2; // ej. (1920 - 1080) / 2 = 420
        const y = (videoHeight - size) / 2; // ej. (1080 - 1080) / 2 = 0

        // 3. Redimensionar el canvas (temporalmente) a la resolución de la FUENTE
        // El canvas ahora es (ej) 1080x1080, no 360x360
        cameraPreview.width = size;
        cameraPreview.height = size;

        // 4. Dibujar el frame de alta res (1080x1080) en el canvas de alta res (1080x1080)
        context.drawImage(cameraStream, x, y, size, size, 0, 0, size, size);

        // 5. Capturar la imagen del canvas (que ahora es de alta res)
        const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
        hiddenImageInput.value = imageDataUrl;
        
        // ==== FIN DE CAMBIOS ====

        // 6. Detener el stream y actualizar UI
        stopCurrentStream(); 
        
        capturePhotoButton.textContent = 'Foto Capturada ✔';
        capturePhotoButton.classList.add('is-captured');
        capturePhotoButton.disabled = true;
        cameraSelect.classList.add('hidden');
    };
    
    // --- Lógica de envío ---
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
    
    // --- Lógica de reporte ---
    const handleGenerateReport = async () => {
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
                    payload: { proyectoSheetId: proyectoSheetId } 
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

    // --- resetForm ---
    const resetForm = () => {
        form.reset();
        resetCameraUI();
        
        // Ponemos el <select> de proyecto en el valor por defecto
        const proyectoSelect = document.getElementById('proyecto-select');
        if (proyectoSelect) {
            proyectoSelect.selectedIndex = 0;
        }
    };

    // --- Asignar eventos ---
    
    // Ahora que todas las funciones están definidas, cargamos los proyectos.
    cargarProyectos();

    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);

    // Listener para el CAMBIO de cámara
    cameraSelect.addEventListener('change', (e) => {
        const newCameraId = e.target.value;
        if (newCameraId) {
            // Inicia un nuevo stream con el ID exacto del dispositivo seleccionado
            // E intenta mantener la alta resolución
            startStream({ 
                video: { 
                    deviceId: { exact: newCameraId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            });
        }
    });
});