import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_HOME_PATH, LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";
import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

const signupPath = `${LOGIN_PATH}?next=${encodeURIComponent(ONBOARDING_PATH)}`;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(APP_HOME_PATH);

  return (
    <main className={styles.landing} id="top">
      <a className={styles.skip} href="#about">
        Skip to content
      </a>
      <section className={styles.hero} aria-label="Welcome to roamr">
        <Image
          className={styles.landscape}
          src="/landing/alpine-lake.jpg"
          alt="A quiet alpine lake beneath misty mountains, with a wooden boathouse on the shore."
          fill
          sizes="100vw"
          priority
        />
        <div className={styles.shade} />
        <header className={styles.header}>
          <a href="#top" className={styles.logo} aria-label="roamr home">
            roamr<span aria-hidden="true">✳</span>
          </a>
          <nav aria-label="Main navigation">
            <a className={styles.aboutLink} href="#about">
              A little about us
            </a>
            <Link href={LOGIN_PATH} className={styles.signin}>
              Sign in <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </header>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>FOR THE PLACES. AND THE PEOPLE.</p>
          <h1 className={styles.wordmark}>
            roamr<span aria-hidden="true">✳</span>
          </h1>
          <h2>
            A little further.
            <br />A little closer.
          </h2>
          <p className={styles.intro}>
            Collect the places you go.
            <br />
            Share the moments with your people.
          </p>
          <Link className={styles.primary} href={signupPath}>
            Create an account <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.note}>Your email. A magic link. You’re in.</p>
        </div>
        <div className={styles.heroBottom}>
          <a href="#about">
            GOOD THINGS HAPPEN OUT THERE <span aria-hidden="true">↓</span>
          </a>
          <span className={styles.location}>
            46°41′ N &nbsp; 12°05′ E<br />
            <b>Lago di Braies, Italy</b>
          </span>
        </div>
      </section>

      <section className={styles.about} id="about" aria-labelledby="about-title">
        <div className={styles.sectionLabel}>
          <span>01 / A PLACE FOR YOUR PLACES</span>
          <span aria-hidden="true">✳</span>
        </div>
        <div className={styles.aboutHeading}>
          <h2 id="about-title">
            Life’s better
            <br />a little <em>out there.</em>
          </h2>
          <p>
            The spontaneous detour. The weekend away. That spot you keep going back to. Roamr gives
            your memories a place to live, and your friends a way to be part of them.
          </p>
        </div>
        <div className={styles.details}>
          <figure className={styles.photo}>
            <Image
              src="/landing/mountain.jpg"
              alt="A sunlit mountain peak rising above a green alpine valley."
              width={1000}
              height={1250}
              sizes="(max-width: 700px) 90vw, 45vw"
            />
            <figcaption>
              <span>A little perspective goes a long way.</span>
              <span aria-hidden="true">↗</span>
            </figcaption>
          </figure>
          <div className={styles.features}>
            <article>
              <span className={styles.number}>01</span>
              <div>
                <h3>Places become collections.</h3>
                <p>
                  Add a photo, keep a moment. Your memories come together by city, with trips to tie
                  the weekends and big adventures together.
                </p>
              </div>
            </article>
            <article>
              <span className={styles.number}>02</span>
              <div>
                <h3>Your people, along for the ride.</h3>
                <p>
                  Share with friends. Tag the ones who were there. Keep up with each other, one real
                  moment at a time.
                </p>
              </div>
            </article>
            <article>
              <span className={styles.number}>03</span>
              <div>
                <h3>More living. Less performing.</h3>
                <p>
                  A chronological feed. A small circle. A place for the photos you love, without the
                  pressure to make them a production.
                </p>
              </div>
            </article>
            <p className={styles.marginNote}>Go somewhere. Feel something. Keep a little of it.</p>
          </div>
        </div>
      </section>

      <section className={styles.join} aria-labelledby="join-title">
        <span className={styles.joinFlower} aria-hidden="true">
          ✳
        </span>
        <p className={styles.eyebrow}>LESS SCROLLING. MORE STORIES.</p>
        <h2 id="join-title">
          Make a little
          <br />
          <em>room for roaming.</em>
        </h2>
        <Link className={styles.primary} href={signupPath}>
          Create an account <span aria-hidden="true">↗</span>
        </Link>
        <p>New here? Your first email link creates your account.</p>
      </section>
      <footer className={styles.footer}>
        <a href="#top" className={styles.logo} aria-label="Back to top">
          roamr<span aria-hidden="true">✳</span>
        </a>
        <p>Brag about touching grass. Only to your friends.</p>
        <span>GO MAKE A MEMORY ↗</span>
      </footer>
    </main>
  );
}
