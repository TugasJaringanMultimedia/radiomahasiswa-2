document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const statusDiv = document.getElementById("status");
  const form = document.getElementById("broadcastForm");
  const formInputs = form.querySelectorAll("input");

  let mediaRecorder;
  let isBroadcasting = false;

  // Set tanggal dan waktu hari ini secara default
  const now = new Date();
  document.getElementById("date").value = now.toISOString().split("T")[0];
  document.getElementById("startTime").value = now
    .toTimeString()
    .split(" ")[0]
    .substring(0, 5);

  btnStart.addEventListener("click", startBroadcasting);
  btnStop.addEventListener("click", stopBroadcasting);

  async function startBroadcasting() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      const formData = new FormData(form);
      const broadcastData = {
        title: formData.get("title"),
        date: formData.get("date"),
        startTime: formData.get("startTime"),
      };

      // Kirim detail siaran ke server untuk memulai
      socket.emit("start_broadcast", broadcastData);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          socket.emit("audio_chunk", event.data);
        }
      };

      mediaRecorder.start(1000); // Kirim data setiap detik

      // Update UI
      isBroadcasting = true;
      btnStart.disabled = true;
      btnStop.disabled = false;
      formInputs.forEach((input) => (input.disabled = true));
      statusDiv.textContent = `Status: Sedang Siaran - ${broadcastData.title}`;
      statusDiv.style.color = "red";
    } catch (error) {
      console.error("Error starting broadcast:", error);
      statusDiv.textContent =
        "Error: Gagal mengakses mikrofon atau memulai siaran.";
    }
  }

  function stopBroadcasting() {
    if (mediaRecorder && isBroadcasting) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      const endTime = new Date().toTimeString().split(" ")[0].substring(0, 5);
      socket.emit("stop_broadcast", { endTime: endTime });

      isBroadcasting = false;
      btnStart.disabled = false;
      btnStop.disabled = true;
      formInputs.forEach((input) => (input.disabled = false));
      statusDiv.textContent = "Status: Tidak Siaran";
      statusDiv.style.color = "grey";
    }
  }
});
