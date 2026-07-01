// =================================================================
// --- CONFIGURACIÓN DEL BACKEND ---
// =================================================================
// ¡Reemplaza esta URL por la de tu Google Apps Script si no la has cambiado!
const GAS_FINANZAS_APP_URL = 'https://script.google.com/macros/s/AKfycbx-5a5cJYhxaJpjIFTAjsfmjE5bLGRE_y6P-0sD2s4_h3DMxO1E-rUclSNvGdajNATr/exec';

document.addEventListener("DOMContentLoaded", function () {

  // --- Lógica de la cámara ---
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const cameras = devices.filter(device => device.kind === 'videoinput');
      cameras.forEach((camera, index) => {});
    })
    .catch(error => console.error('Error al enumerar dispositivos:', error));

  const video = document.getElementById('video');
  const captureButton = document.getElementById('captureButton');
  const canvas = document.getElementById('canvas');
  const context = canvas.getContext('2d');
  const cameraSelect = document.getElementById('cameraSelect');

  let currentStream = null;
  let videoAspectRatio = 1; 

  function getCameras() {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const cameras = devices.filter(device => device.kind === 'videoinput');
        cameraSelect.innerHTML = '';
        cameras.forEach((camera, index) => {
          let option = document.createElement('option');
          option.value = camera.deviceId;
          option.textContent = camera.label || `Cámara ${index + 1}`;
          cameraSelect.appendChild(option);
        });

        const storedCamera = localStorage.getItem('preferredCamera');
        if (storedCamera) {
          cameraSelect.value = storedCamera;
          switchCamera(storedCamera);
        } else if (cameras.length > 0) {
          switchCamera(cameras[0].deviceId);
        }
      })
      .catch(error => console.error('Error al obtener las cámaras:', error));
  }

  function switchCamera(deviceId) {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    const constraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        facingMode: 'user',
        focusMode: 'continuous'
      }
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          videoAspectRatio = videoWidth / videoHeight;
          const canvasWidth = window.innerWidth * 0.6;
          const canvasHeight = canvasWidth / videoAspectRatio;
          canvas.width = videoWidth;
          canvas.height = videoHeight;
          video.width = canvasWidth;
          video.height = canvasHeight;
        };
        currentStream = stream;
      })
      .catch(error => {
        console.error('Error al acceder a la cámara en 4K:', error);
        switchToBestAvailableResolution(deviceId);
      });
  }

  function switchToBestAvailableResolution(deviceId) {
    const fallbackConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: 'user',
        focusMode: 'continuous'
      }
    };
    navigator.mediaDevices.getUserMedia(fallbackConstraints)
      .then(stream => {
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          videoAspectRatio = videoWidth / videoHeight;
          const canvasWidth = window.innerWidth * 0.6;
          const canvasHeight = canvasWidth / videoAspectRatio;
          canvas.width = videoWidth;
          canvas.height = videoHeight;
          video.width = canvasWidth;
          video.height = canvasHeight;
        };
        currentStream = stream;
      })
      .catch(error => console.error('Error de resolución de respaldo:', error));
  }

  cameraSelect.addEventListener('change', function () {
    const deviceId = cameraSelect.value;
    if (deviceId) {
      localStorage.setItem('preferredCamera', deviceId);
      switchCamera(deviceId);
    }
  });

  getCameras();

  let previousCanvas = null;

  captureButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (currentStream) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/png');

      if (previousCanvas) {
        previousCanvas.remove();
      }

      const newCanvas = document.createElement('canvas');
      const imagenPrototipoDiv = document.getElementById('imagenPrototipo');
      imagenPrototipoDiv.appendChild(newCanvas);
      const newContext = newCanvas.getContext('2d');
      const contenedorWidth = imagenPrototipoDiv.offsetWidth;
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        const newWidth = contenedorWidth;
        const newHeight = newWidth / aspectRatio;
        newCanvas.width = newWidth;
        newCanvas.height = newHeight;
        newContext.drawImage(img, 0, 0, newCanvas.width, newCanvas.height);
      };
      img.src = base64Image;
      previousCanvas = newCanvas;
    }
  });

  // --- Lógica de botones ---
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('ticketImage');

  uploadBtn.addEventListener('click', () => fileInput.click());

  const selectTicket = document.getElementById('ticket');
  selectTicket.addEventListener('change', actualizarVisibilidadFieldset);

});

function setFechaOperacion() {
  let today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  let date = today.toISOString().split('T')[0];
  document.getElementsByName('fechaOperacion')[0].value = date;
}

function estimarTamanoEnvio(datos, base64Image) {
  const json = JSON.stringify(datos);
  const datosBytes = new TextEncoder().encode(json).length;
  const base64Bytes = base64Image ? (base64Image.length * 3) / 4 : 0;
  return datosBytes + base64Bytes;
}

function actualizarVisibilidadFieldset() {
  const select = document.getElementById('ticket');
  const fieldset = document.getElementById('ticketFieldset');
  
  if (select.value === 'SI') {
    fieldset.style.display = 'flex';
  } else {
    fieldset.style.display = 'none';
  }
}

function simularCarga(tamanoEstimado) {
  const duracionTotal = Math.min(4000 + tamanoEstimado / 2, 25000);
  const barra = document.getElementById('barraCarga');
  let progreso = 0;
  let inicio = Date.now();
  const intervalo = setInterval(() => {
    const tiempoTranscurrido = Date.now() - inicio;
    progreso = Math.min((tiempoTranscurrido / duracionTotal) * 100, 100);
    barra.style.width = progreso + '%';
    if (progreso >= 100) {
      clearInterval(intervalo);
    }
  }, 100);
}

function enviarDatos(event) {
  event.preventDefault();
  let formData = new FormData(document.getElementById('registroForm'));
  let datos = {};
  formData.forEach((value, key) => datos[key] = value);

  let ticketFileInput = document.getElementById('ticketImage');
  let ticketFile = ticketFileInput ? ticketFileInput.files[0] : null;
  let base64Image = null;

  if (ticketFile) {
    let reader = new FileReader();
    reader.onloadend = function () {
      base64Image = reader.result.split(',')[1];
      enviarDatosServidor(datos, base64Image);
    };
    reader.readAsDataURL(ticketFile);
  } else {
    let canvas = document.getElementById('canvas');
    if (canvas.toDataURL() === document.createElement('canvas').toDataURL()) {
      if(document.getElementById('ticket').value === 'SI') {
         base64Image = null; 
      } else {
         base64Image = "NO"; 
      }
    } else {
      base64Image = canvas.toDataURL('image/png').split(',')[1];
    }
    enviarDatosServidor(datos, base64Image);
  }
}

async function enviarDatosServidor(datos, base64Image) {
  var seleccion = document.getElementById('opcionSelect').value;
  var ids = {
    'ALSE': '15zTEe8GMA4Ji2b8GWEP94DHvfdcCqlYOSFdQG8honk4',
    'MANTONET': '1r4Xl5yXN8SaSNnIJyDTjK0JmjVTnE394jxLjhiHf5YM'
  };
  var selectedId = ids[seleccion];

  if (!selectedId) {
    alert('Seleccione una opción válida.');
    return;
  }
  datos.opcionSelect = seleccion;

  document.getElementById('registroForm').style.display = 'none';
  document.getElementById('loadingMessage').style.display = 'flex';

  const tamanoEstimado = estimarTamanoEnvio(datos, base64Image);
  simularCarga(tamanoEstimado);

  var ticketSiNo = document.getElementById('ticket').value;
  if (ticketSiNo == "NO") {
    base64Image = "NO";
  }

  try {
    const payload = {
      sheetId: selectedId,
      sheetName: 'BD', 
      datos: datos,
      base64Image: base64Image
    };

    const response = await fetch(GAS_FINANZAS_APP_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    if (!response.ok) {
       let errorMsg = `Error de red: ${response.status}`;
       try { errorMsg = JSON.parse(responseText).message || errorMsg; } catch (e) {}
       throw new Error(errorMsg);
    }

    const result = JSON.parse(responseText);

    if (result.status === 'success') {
      mostrarPanelExito(result.message);
    } else {
      throw new Error(result.message || 'Error desconocido del servidor.');
    }

  } catch (error) {
    alert('Error al enviar el registro: ' + error.message);
    document.getElementById('registroForm').style.display = 'flex';
    document.getElementById('loadingMessage').style.display = 'none';
  }
}

async function cargarProyectos() {
  if (GAS_FINANZAS_APP_URL === 'URL_DE_TU_NUEVA_WEB_APP_AQUI') {
    document.getElementById('proyecto').disabled = true;
    return;
  }
  try {
    const response = await fetch(GAS_FINANZAS_APP_URL, { method: 'GET', mode: 'cors' });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Error de red al cargar proyectos: ${response.status}`);

    const result = JSON.parse(responseText);

    if (result.status === 'success' && result.proyectos) {
      const selectProyecto = document.getElementById('proyecto');
      while (selectProyecto.options.length > 1) {
         selectProyecto.remove(1);
      }
      result.proyectos.forEach(proyecto => {
        let option = document.createElement('option');
        option.value = proyecto;
        option.textContent = proyecto;
        selectProyecto.appendChild(option);
      });
    }
  } catch (error) {
    alert('No se pudo cargar la lista de proyectos. ' + error.message);
  }
}

window.onload = () => {
  setFechaOperacion();
  cargarProyectos(); 
  actualizarVisibilidadFieldset(); 
};

function formatearMonto(input) {
  let valor = input.value.replace(/[^0-9.]/g, '');
  let cursorPos = input.selectionStart;
  let puntoIndex = valor.indexOf('.');

  if (puntoIndex !== -1) {
    let partes = valor.split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    valor = partes.join('.');
  } else {
    valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  input.value = `$ ${valor}`;
  let nuevoCursorPos = Math.min(valor.length + 2, input.value.length);
  input.setSelectionRange(nuevoCursorPos, nuevoCursorPos);
}

function mostrarPanelExito() {
  const successPanel = document.getElementById('successPanel');
  successPanel.style.display = 'flex';
  const successSound = document.getElementById('successSound');
  successSound.play().catch(e => console.error("Error al reproducir sonido:", e));

  setTimeout(() => {
    successPanel.style.display = 'none';
    document.getElementById('registroForm').reset();
    document.getElementById('registroForm').style.display = 'flex';
    document.getElementById('loadingMessage').style.display = 'none';
    actualizarVisibilidadFieldset();
    setFechaOperacion();
    
    document.getElementById('imagenPrototipo').innerHTML = '';
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, 2500);
}