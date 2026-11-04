/**
 * import の決まりごと。`npm run deps:check` で検査する。
 * 決まりの意図は docs/ARCHITECTURE.md の「依存の決まり」を参照。
 *
 * 今ある違反は .dependency-cruiser-known-violations.json に控えてあり、検査では数えない。
 * 直したら `npm run deps:baseline` で控えを作り直す（増やすためには使わない）。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '循環した import は、どちらを先に読み込むかで動きが変わり、追うのも難しい。共通の部分を別ファイルに出す。',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'lib-not-to-bot',
      comment:
        'vrchat/・x/・canva/・image-gen/・video/ は Bot から使う部品。Bot（discordbot/）の設定や処理を読まず、'
        + '必要な値は呼び出し側から引数で受け取る。',
      severity: 'error',
      from: { path: '^src/(vrchat|x|canva|image-gen|video)/' },
      to: { path: '^src/discordbot/' },
    },
    {
      name: 'commands-utils-only-from-commands',
      comment: 'commands/utils はスラッシュコマンド用の部品。コマンド以外からも使うものは shared/ に置く。',
      severity: 'error',
      from: { path: '^src/discordbot/', pathNot: '^src/discordbot/commands/' },
      to: { path: '^src/discordbot/commands/utils' },
    },
    {
      name: 'shared-not-to-features',
      comment:
        'shared/ はどの機能からも使う共通の部品。特定の機能に引きずられないよう、shared/ と config.ts のほかは import しない。',
      severity: 'error',
      from: { path: '^src/discordbot/shared/' },
      to: { path: '^src/discordbot/', pathNot: '^src/discordbot/(shared/|config\\.ts$)' },
    },
    // 機能ごとのフォルダー（src/discordbot/features/<機能>/）の決まり
    {
      name: 'features-via-index',
      comment:
        '機能の外からは features/<機能>/index.ts だけを import する。外に見せるものを index.ts で一覧できるようにするため。'
        + '外で使うものが増えたら index.ts に export を足す。',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/discordbot/features/' },
      to: { path: '^src/discordbot/features/', pathNot: '^src/discordbot/features/[^/]+/index\\.ts$' },
    },
    {
      name: 'features-via-index-between-features',
      comment: '別の機能も、その機能の index.ts だけを import する。',
      severity: 'error',
      from: { path: '^src/discordbot/features/([^/]+)/' },
      to: {
        path: '^src/discordbot/features/',
        pathNot: ['^src/discordbot/features/$1/', '^src/discordbot/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'features-on-foundation',
      comment:
        '機能が頼ってよいのは、ほかの機能・shared/・config.ts・interactions.ts・storage.ts（と部品）だけ。'
        + '入口（index.ts・handlers.ts・commands/index.ts）や、まだ機能のフォルダーに入っていないファイルには依存しない。',
      severity: 'error',
      from: { path: '^src/discordbot/features/' },
      to: {
        path: '^src/discordbot/',
        pathNot: ['^src/discordbot/(features|shared)/', '^src/discordbot/(config|interactions|storage)\\.ts$'],
      },
    },
    {
      name: 'lt-is-provider',
      comment: 'LT は開催確認・イベント登録・録画などから使われる側。LT からほかの機能は import しない。',
      severity: 'error',
      from: { path: '^src/discordbot/features/lt/' },
      to: { path: '^src/discordbot/features/', pathNot: '^src/discordbot/features/lt/' },
    },
    {
      name: 'calendar-is-provider',
      comment: 'イベント登録は開催確認から使われる側。使ってよいほかの機能は LT（イベント名に LT のタイトルを入れる）だけ。',
      severity: 'error',
      from: { path: '^src/discordbot/features/calendar/' },
      to: { path: '^src/discordbot/features/', pathNot: '^src/discordbot/features/(calendar|lt)/' },
    },
    {
      name: 'slides-is-provider',
      comment: '司会進行スライドは開催確認から使われる側。ほかの機能は import しない。',
      severity: 'error',
      from: { path: '^src/discordbot/features/slides/' },
      to: { path: '^src/discordbot/features/', pathNot: '^src/discordbot/features/slides/' },
    },
    {
      name: 'libs-independent',
      comment: '部品（vrchat/・x/・canva/・image-gen/・video/）どうしは import しない。組み合わせるのは Bot の側でする。',
      severity: 'error',
      from: { path: '^src/(vrchat|x|canva|image-gen|video)/' },
      to: { path: '^src/(vrchat|x|canva|image-gen|video)/', pathNot: '^src/$1/' },
    },
    // 外部サービスの SDK は、それを受け持つ部品の中だけで使う。外部とのやりとりを探す場所を固定するため
    {
      name: 'twitter-sdk-only-in-x',
      comment: 'X（twitter-api-v2）とのやりとりは x/ にまとめる。',
      severity: 'error',
      from: { pathNot: '^src/x/' },
      to: { path: '^node_modules/twitter-api-v2/' },
    },
    {
      name: 'axios-only-in-api-libs',
      comment: 'HTTP で外部の API を呼ぶのは vrchat/・canva/ にまとめる。',
      severity: 'error',
      from: { pathNot: '^src/(vrchat|canva)/' },
      to: { path: '^node_modules/axios/' },
    },
    {
      name: 'renderer-only-in-image-gen',
      comment: 'ヘッドレス Chromium（puppeteer-core）と React の HTML 化（react-dom）は image-gen/ にまとめる。',
      severity: 'error',
      from: { pathNot: '^src/image-gen/' },
      to: { path: '^node_modules/(puppeteer-core|react-dom)/' },
    },
    {
      name: 'not-to-dev-dep',
      comment:
        '本番の自動デプロイも devDependencies を入れているが、テストや開発の道具に本番のコードが頼らないようにする。'
        + '型だけの import は数えない。',
      severity: 'error',
      from: { path: '^src/' },
      to: {
        dependencyTypes: ['npm-dev'],
        dependencyTypesNot: ['type-only'],
        pathNot: ['node_modules/@types/'],
      },
    },
    {
      name: 'no-orphans',
      comment: 'どこからも import されず、何も import しないファイル。使われていないなら消す。',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)__tests__/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
  },
};
