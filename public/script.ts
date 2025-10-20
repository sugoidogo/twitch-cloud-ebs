fetch('/message')
    .then((resp) => resp.text())
    .then((text) => {
        const h1 = document.getElementById('heading')!;
        h1.textContent = text;
    });

const button = document.getElementById("button")!;
button.addEventListener("click", () => {
    fetch('/random')
        .then((resp) => resp.text())
        .then((text) => {
            const random = document.getElementById('random')!;
            random.textContent = text;
        });
});