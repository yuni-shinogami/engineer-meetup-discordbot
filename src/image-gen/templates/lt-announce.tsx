/**
 * LT 告知画像（1200x1600）。
 *
 * 見た目は同じディレクトリの `lt-announce.css` に書く。ブラウザ（Chromium）で描くので、
 * grid・グラデーション・filter・text-shadow など普通の CSS がそのまま使える。
 * 画像は data URL か、`assets/` 以下のパス（generate.ts が配る）で参照する。
 */
export interface LtAnnounceTemplateProps {
  title: string;
  speakerName: string;
  speakerIcon: string;
  eventDate: string;
  titleSlideImage: string;
}

export const LT_ANNOUNCE_SIZE = { width: 1200, height: 1600 } as const;

export function LtAnnounceTemplate({
  title,
  speakerName,
  speakerIcon,
  eventDate,
  titleSlideImage,
}: LtAnnounceTemplateProps) {
  return (
    <main className="lt-announce">
      <header className="bar">エンジニア集会 lt</header>

      <section className="body">
        <div className="event">
          <img className="logo" src="assets/images/em_logo_620px_A.png" alt="" />
          <h1>エンジニア集会LT</h1>
          <p className="date">{eventDate}（金）22:00 ~</p>
        </div>

        <div className="talk">
          <div className="info">
            <span className="label">LTタイトル：</span>
            <span className="title">{title}</span>
            <p className="speaker">
              <span className="speaker-label">スピーカー：</span>
              <span className="speaker-name">{speakerName}</span>
            </p>
          </div>
          <div className="icon">
            <img src={speakerIcon} alt="" />
          </div>
        </div>
      </section>

      <footer className="slide">
        <img src={titleSlideImage} alt="" />
      </footer>
    </main>
  );
}
