import { readFileSync } from 'fs';
import { join } from 'path';

const EM_LOGO = `data:image/png;base64,${readFileSync(join(__dirname, '../assets/images/em_logo_620px_A.png')).toString('base64')}`;


export interface LtAnnounceTemplateProps {
  title: string;
  speakerName: string;
  speakerIcon: string;
  eventDate: string;
  titleSlideImage: string;
}

const INK = '#111111';
const DARK = '#333333';

export function LtAnnounceTemplate({
  title,
  speakerName,
  speakerIcon,
  eventDate,
  titleSlideImage,
}: LtAnnounceTemplateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        fontFamily: 'NotoSansJP',
      }}
    >
      {/* ヘッダーのオレンジバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f27205',
          height: 95,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 700, color: '#ffffff', letterSpacing: 3 }}>
          エンジニア集会 lt
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          padding: '60px 35px 0px',
        }}
      >
        {/* Event logo + title + date */}
        <div style={{ display: 'flex', marginBottom: '70px', flexDirection: 'column', gap: 6 }}>
          <img src={EM_LOGO} width={290} height={75} />
          <span style={{ fontSize: 40, fontWeight: 700, color: INK }}>エンジニア集会LT</span>
          <span style={{ fontSize: 25, fontWeight: 700, color: DARK }}>{eventDate}（金）22:00 ~</span>
        </div>

        {/* LTタイトル label */}
        <div style={{ display: 'flex', marginBottom: '120px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: '50%' }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>LTタイトル：</span>
            <span style={{ fontSize: 40, fontWeight: 700 }}>
              {title}
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 26 }}>スピーカー：</span><span style={{ fontSize: 35, fontWeight: 700 }}>{speakerName}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', width: '50%' }}>
            <img src={speakerIcon} width={510} height={510} style={{ borderRadius: '50%' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', height: '600px', backgroundColor: '#f27205', }} >
        <img src={titleSlideImage} height={600}></img>
      </div>

    </div >
  );
}
