(function () {
  "use strict";

  var app = document.getElementById("app");
  var form = document.getElementById("transcription-form");
  var entryView = document.getElementById("entry-view");
  var input = document.getElementById("youtube-url");
  var submitButton = document.getElementById("submit-button");
  var submitLabel = submitButton.querySelector(".button-label");
  var spinner = submitButton.querySelector(".spinner");
  var statusMessage = document.getElementById("status-message");
  var errorView = document.getElementById("error-view");
  var errorMessage = document.getElementById("error-message");
  var retryButton = document.getElementById("retry-button");
  var resultView = document.getElementById("result-view");
  var transcript = document.getElementById("transcript");
  var truncatedWarning = document.getElementById("truncated-warning");
  var copyButton = document.getElementById("copy-button");
  var copyBottomButton = document.getElementById("copy-bottom-button");
  var shareButton = document.getElementById("share-button");
  var newButton = document.getElementById("new-button");
  var newBottomButton = document.getElementById("new-bottom-button");
  var announcer = document.getElementById("action-announcer");

  var fallbackMessages = {
    ACCESS_DENIED:
      "Este link de acesso não é válido. Abra novamente o endereço que foi guardado para si.",
    INVALID_REQUEST: "O pedido não pôde ser lido. Tente novamente.",
    INVALID_URL: "Cole um link válido de um vídeo do YouTube.",
    UNKNOWN_ERROR: "Algo correu mal. Tente novamente.",
  };

  function getFamilyToken() {
    var hash = window.location.hash.slice(1);
    if (hash.indexOf("access=") === 0) {
      hash = hash.slice(7);
    }

    try {
      return decodeURIComponent(hash);
    } catch (_error) {
      return "";
    }
  }

  function isYouTubeUrl(value) {
    try {
      var url = new URL(value);
      var hostname = url.hostname.toLowerCase();
      return (
        url.protocol === "https:" &&
        (hostname === "youtu.be" ||
          hostname === "youtube.com" ||
          hostname === "www.youtube.com" ||
          hostname === "m.youtube.com")
      );
    } catch (_error) {
      return false;
    }
  }

  function setBusy(busy) {
    app.setAttribute("aria-busy", busy ? "true" : "false");
    input.disabled = busy;
    submitButton.disabled = busy;
    submitLabel.textContent = busy ? "A transcrever" : "Transcrever";
    spinner.hidden = !busy;
    statusMessage.hidden = !busy;
    statusMessage.textContent = busy
      ? "Estamos a preparar a transcrição. Vídeos longos podem demorar alguns minutos."
      : "";
  }

  function showError(message) {
    resultView.hidden = true;
    entryView.hidden = false;
    errorMessage.textContent = message;
    errorView.hidden = false;
    retryButton.focus();
  }

  function showResult(data) {
    errorView.hidden = true;
    entryView.hidden = true;
    transcript.textContent = data.transcript;
    truncatedWarning.hidden = !data.truncated;
    resultView.hidden = false;
    resultView.scrollIntoView({ block: "start" });
    transcript.focus();
  }

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(function () {
      announcer.textContent = message;
    }, 20);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    var copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) {
      throw new Error("Copy command failed.");
    }
  }

  function copyTranscript() {
    var text = transcript.textContent || "";
    var copyPromise;

    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      copyPromise = navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      copyPromise = Promise.resolve().then(function () {
        fallbackCopy(text);
      });
    }

    return copyPromise
      .then(function () {
        announce("Texto copiado.");
        copyButton.textContent = "Texto copiado";
        copyBottomButton.textContent = "Texto copiado";
        window.setTimeout(function () {
          copyButton.textContent = "Copiar texto";
          copyBottomButton.textContent = "Copiar texto";
        }, 1800);
      })
      .catch(function () {
        announce("Não foi possível copiar o texto.");
      });
  }

  function shareTranscript() {
    var text = transcript.textContent || "";

    if (typeof navigator.share !== "function") {
      return copyTranscript();
    }

    return navigator
      .share({
        title: "Transcrição",
        text: text,
      })
      .catch(function (error) {
        if (!error || error.name !== "AbortError") {
          return copyTranscript();
        }
      });
  }

  function reset() {
    resultView.hidden = true;
    errorView.hidden = true;
    entryView.hidden = false;
    truncatedWarning.hidden = true;
    transcript.textContent = "";
    input.value = "";
    input.focus();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorView.hidden = true;

    var submittedUrl = input.value.trim();
    if (!isYouTubeUrl(submittedUrl)) {
      showError("Cole um link válido de um vídeo do YouTube.");
      return;
    }

    setBusy(true);

    window
      .fetch("/api/transcriptions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-family-token": getFamilyToken(),
        },
        body: JSON.stringify({ url: submittedUrl }),
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok) {
              var code = data.error && data.error.code;
              var message = data.error && data.error.message;
              throw new Error(
                message || fallbackMessages[code] || fallbackMessages.UNKNOWN_ERROR,
              );
            }

            return data;
          });
      })
      .then(function (data) {
        if (!data || typeof data.transcript !== "string") {
          throw new Error(fallbackMessages.UNKNOWN_ERROR);
        }

        showResult(data);
      })
      .catch(function (error) {
        showError(
          error && error.message
            ? error.message
            : fallbackMessages.UNKNOWN_ERROR,
        );
      })
      .then(function () {
        setBusy(false);
      });
  });

  retryButton.addEventListener("click", function () {
    errorView.hidden = true;
    input.focus();
  });

  copyButton.addEventListener("click", copyTranscript);
  copyBottomButton.addEventListener("click", copyTranscript);
  shareButton.addEventListener("click", shareTranscript);
  newButton.addEventListener("click", reset);
  newBottomButton.addEventListener("click", reset);
})();
