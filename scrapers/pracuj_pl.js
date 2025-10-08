import axios from "axios";
import * as cheerio from "cheerio";

export async function fetchPracujJobs(keyword) {
  const encodedKeyword = encodeURIComponent(keyword);
  const URL = `https://www.pracuj.pl/praca/${encodedKeyword};kw/warszawa;wp/ostatnich%2024h;p,1?rd=0`;

  console.log("Пошуковий URL pracuj.pl:", URL);

  const jobs = [];
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    $(".tiles_cobg3mp").each((i, el) => {
      const titleEl = $(el).find("[data-test='link-offer-title']");
      const offerLink = titleEl.attr("href");
      if (!offerLink) return;

      jobs.push({
        title: titleEl.text().trim(),
        offerLink,
        company: $(el).find("[data-test='text-company-name']").text().trim(),
        location: $(el).find("[data-test='text-region']").text().trim(),
        salary: $(el).find("[data-test='offer-salary']").text().trim() || "",
        published: $(el).find(".tiles_a1nm2ekh").text().trim(),
      });
    });
  } catch (err) {
    console.error("Помилка fetchPracujJobs:", err.message);
  }

  return jobs;
}
