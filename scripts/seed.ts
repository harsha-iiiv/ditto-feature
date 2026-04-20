import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

const POOL = [
  { name: "Alex", age: 21, major: "English Literature", vibe_tags: ["literary", "musical", "indie"], bio_blurb: "Plays bass in a campus band. Last book: Murakami's Norwegian Wood.", campus: "UC Berkeley" },
  { name: "Priya", age: 20, major: "Computer Science", vibe_tags: ["intellectual", "coffee", "reader"], bio_blurb: "Reads philosophy between coding sprints. Loves Dostoevsky and cold brew.", campus: "UC Berkeley" },
  { name: "Jordan", age: 22, major: "Finance", vibe_tags: ["ambitious", "gym", "finance_culture"], bio_blurb: "IB-bound. Lifts at 6am. Collects spreadsheets.", campus: "UC Berkeley" },
  { name: "Sam", age: 21, major: "Environmental Science", vibe_tags: ["outdoorsy", "hiker", "sustainable"], bio_blurb: "Weekends in Yosemite. Composts. Strong opinions on native plants.", campus: "UC Berkeley" },
  { name: "Maya", age: 20, major: "Art History", vibe_tags: ["artsy", "museums", "film"], bio_blurb: "Curates campus film nights. Favorite: Wong Kar-wai.", campus: "UC Berkeley" },
  { name: "Ethan", age: 22, major: "Music Composition", vibe_tags: ["musical", "composer", "literary"], bio_blurb: "Writes chamber music. Reads poetry in three languages.", campus: "UC Berkeley" },
  { name: "Lin", age: 21, major: "Biology", vibe_tags: ["science", "runner", "outdoorsy"], bio_blurb: "Marathon runner. Pre-med. Reads New Yorker cover to cover.", campus: "UC Berkeley" },
  { name: "Noah", age: 23, major: "Philosophy", vibe_tags: ["intellectual", "reader", "literary", "indie"], bio_blurb: "Writing a thesis on Wittgenstein. Plays terrible guitar well.", campus: "UC Berkeley" },
  { name: "Zara", age: 20, major: "Data Science", vibe_tags: ["intellectual", "coffee", "tech"], bio_blurb: "Kaggle grandmaster. Makes a mean pour-over.", campus: "UC Berkeley" },
  { name: "Diego", age: 22, major: "Mechanical Engineering", vibe_tags: ["builder", "outdoorsy", "athletic"], bio_blurb: "Built his own rock-climbing wall. Works in the makerspace.", campus: "UC Berkeley" },
  { name: "Hana", age: 21, major: "Creative Writing", vibe_tags: ["literary", "indie", "film", "reader"], bio_blurb: "MFA-bound. Screenprint hobby. Favorite: Annie Ernaux.", campus: "UC Berkeley" },
  { name: "Rohan", age: 21, major: "Economics", vibe_tags: ["ambitious", "finance_culture", "tech"], bio_blurb: "Goldman-bound. Crushes leetcode. Surprisingly good at trivia.", campus: "UC Berkeley" },
  { name: "Iris", age: 20, major: "Dance", vibe_tags: ["artsy", "musical", "athletic"], bio_blurb: "Choreographs for the campus company. Loves a long walk.", campus: "UC Berkeley" },
  { name: "Owen", age: 23, major: "History", vibe_tags: ["literary", "reader", "intellectual"], bio_blurb: "Archival rabbit-holer. Reads Gibbon for fun. Bad at sports.", campus: "UC Berkeley" },
  { name: "Kira", age: 21, major: "Psychology", vibe_tags: ["thoughtful", "reader", "indie"], bio_blurb: "Journals daily. Favorite novel: Bel Canto. Loves quiet bars.", campus: "UC Berkeley" },
  { name: "Leo", age: 22, major: "Film Studies", vibe_tags: ["film", "artsy", "indie"], bio_blurb: "Runs a Letterboxd with 3K followers. Always has 35mm on him.", campus: "UC Berkeley" },
  { name: "Naomi", age: 20, major: "Classics", vibe_tags: ["literary", "intellectual", "reader"], bio_blurb: "Reads Ovid in Latin. Makes her own sourdough.", campus: "UC Berkeley" },
  { name: "Tate", age: 22, major: "Marketing", vibe_tags: ["ambitious", "finance_culture", "social"], bio_blurb: "Networks like breathing. Great at parties. Less great at books.", campus: "UC Berkeley" },
  { name: "Sasha", age: 21, major: "Architecture", vibe_tags: ["artsy", "builder", "film"], bio_blurb: "Draws buildings in cafes. Makes zines. Loves Tarkovsky.", campus: "UC Berkeley" },
  { name: "Marcus", age: 23, major: "Jazz Performance", vibe_tags: ["musical", "indie", "literary"], bio_blurb: "Saxophone. Reads Baldwin. Cooks a serious gumbo.", campus: "UC Berkeley" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = postgres(databaseUrl, { ssl: "require" });

  try {
    await sql`TRUNCATE TABLE rejection_feedback, proposed_dates, preference_briefs, users, mock_pool RESTART IDENTITY CASCADE`;
    for (const person of POOL) {
      await sql`
        INSERT INTO mock_pool (name, age, major, vibe_tags, bio_blurb, campus)
        VALUES (${person.name}, ${person.age}, ${person.major}, ${person.vibe_tags}, ${person.bio_blurb}, ${person.campus})
      `;
    }
    console.log(`Seeded ${POOL.length} profiles.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
