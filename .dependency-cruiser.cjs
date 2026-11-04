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
