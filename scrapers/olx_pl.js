import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

export async function fetchOlxJobs(keyword) {
  try {
    const formattedKeyword = keyword.trim().replace(/\s+/g, "-");
    const URL = `https://www.olx.pl/praca/warszawa/q-${formattedKeyword}/?search%5Border%5D=created_at:desc`;

    console.log("Пошуковий URL OLX:", URL);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle2" });

    const html = await page.content();
    const $ = cheerio.load(html);
    const jobs = [];

    $(".jobs-ad-card.css-kmmxkx").each((i, el) => {
      const titleEl = $(el).find(".css-13gxtrp");
      const offerLink = titleEl.attr("href");
      if (!offerLink) return;

      jobs.push({
        title: titleEl.text().trim(),
        offerLink: offerLink.startsWith("http") ? offerLink : `https://www.olx.pl${offerLink}`,
        company: $(el).find(".css-w5qju7").text().trim() || "",
        location: $(el).find(".css-jw5wnz").text().trim() || "",
        salary: $(el).find(".css-ltt2h").text().trim() || "",
        published: $(el).find(".css-1h96hyx").text().trim() || "",
      });
    });

    await browser.close();
    return jobs;
  } catch (err) {
    console.error("Помилка fetchOlxJobs:", err.message);
    return [];
  }
}
