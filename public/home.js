const summary = document.querySelector("#homeSummary");
const updated = document.querySelector("#summaryUpdated");
const slideImage = document.querySelector("#homeSlideImage");
const slideFallback = document.querySelector("#homeSlideFallback");
const slideTag = document.querySelector("#homeSlideTag");
const slideTitle = document.querySelector("#homeSlideTitle");
const slideText = document.querySelector("#homeSlideText");
const dots = document.querySelector("#homeSliderDots");
const prevSlide = document.querySelector("#prevSlide");
const nextSlide = document.querySelector("#nextSlide");

const slides = [
  {
    image: "/uploads/slider/slide-1.jpg",
    tag: "Association",
    title: "KLSWA State Meeting",
    text: "Official updates, member coordination, and licensed surveyor welfare programs."
  },
  {
    image: "/uploads/slider/slide-2.jpg",
    tag: "Taluk Team",
    title: "Taluk Technical Team Coordination",
    text: "Taluk-level data support, verification, correction follow-up, and member service."
  },
  {
    image: "/uploads/slider/slide-3.jpg",
    tag: "Members",
    title: "Licensed Surveyors Unity",
    text: "A shared digital platform for Karnataka licensed surveyor records and communication."
  },
  {
    image: "/uploads/slider/slide-4.jpg",
    tag: "Training",
    title: "Training and Awareness Programs",
    text: "Use this slider for meeting, training, strike, committee, and field-work photos."
  }
];

let currentSlide = 0;
let slideTimer = null;

function number(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

async function loadSummary() {
  try {
    const response = await fetch("/api/public-summary");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load summary");
    summary.innerHTML = `
      <div><span class="muted">Members</span><strong>${number(data.total)}</strong></div>
      <div><span class="muted">Districts</span><strong>${number(data.districts)}</strong></div>
      <div><span class="muted">Taluks</span><strong>${number(data.taluks)} / ${number(data.masterTaluks)}</strong></div>
      <div><span class="muted">Pending</span><strong>${number(data.pending)}</strong></div>
    `;
    updated.textContent = `Last updated: ${dateText(data.updatedAt) || "Recently"}`;
  } catch (error) {
    updated.textContent = "Live summary is temporarily unavailable.";
  }
}

function showSlide(index) {
  if (!slideImage) return;
  currentSlide = (index + slides.length) % slides.length;
  const slide = slides[currentSlide];
  slideFallback.classList.remove("visible");
  slideImage.classList.remove("hidden");
  slideImage.src = slide.image;
  slideImage.alt = slide.title;
  slideTag.textContent = slide.tag;
  slideTitle.textContent = slide.title;
  slideText.textContent = slide.text;
  dots.innerHTML = slides.map((_, dotIndex) => `
    <button type="button" class="${dotIndex === currentSlide ? "active" : ""}" data-slide="${dotIndex}" aria-label="Open slide ${dotIndex + 1}"></button>
  `).join("");
  dots.querySelectorAll("[data-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      showSlide(Number(button.dataset.slide));
      startSlider();
    });
  });
}

function startSlider() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => showSlide(currentSlide + 1), 5000);
}

function bindSlider() {
  if (!slideImage) return;
  slideImage.addEventListener("error", () => {
    slideImage.classList.add("hidden");
    slideFallback.classList.add("visible");
  });
  prevSlide.addEventListener("click", () => {
    showSlide(currentSlide - 1);
    startSlider();
  });
  nextSlide.addEventListener("click", () => {
    showSlide(currentSlide + 1);
    startSlider();
  });
  showSlide(0);
  startSlider();
}

bindSlider();
loadSummary();
