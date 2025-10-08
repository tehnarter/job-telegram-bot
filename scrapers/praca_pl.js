import axios from "axios";
import * as cheerio from "cheerio";

function toAscii(str) {
  const map = { 
    "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z",
    "Ą":"A","Ć":"C","Ę":"E","Ł":"L","Ń":"N","Ó":"O","Ś":"S","Ź":"Z","Ż":"Z"
  };
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => map[c] || c);
}

export async function fetchPracaJobs(keyword, city = "warszawa") {
  const formattedKeyword = toAscii(keyword.trim().toLowerCase().split(/\s+/).join(","));
  const URL = `https://www.praca.pl/s-${formattedKeyword}_m-${city}_d-1.html`;

  console.log("Пошуковий URL praca.pl:", URL);

  const jobs = [];
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    $(".listing__item").each((i, el) => {
      const titleEl = $(el).find(".listing__title");
      const offerLink = titleEl.attr("href");
      if (!offerLink) return;

      jobs.push({
        title: titleEl.text().trim(),
        offerLink: offerLink.startsWith("http") ? offerLink : `https://www.praca.pl${offerLink}`,
        company: $(el).find(".listing__employer-name").first().text().trim(),
        location: $(el).find(".listing__origin span").last().text().trim(),
        salary: $(el).find(".listing__main-details span").first().text().trim(),
        published: $(el).find(".listing__secondary-details span").first().text().trim(),
      });
    });
  } catch (err) {
    console.error("Помилка fetchPracaJobs:", err.message);
  }

  return jobs;
}
