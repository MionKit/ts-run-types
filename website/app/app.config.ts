export default defineAppConfig({
  seo: {
    title: 'ts-run-types — TypeScript types that show up at runtime',
    description:
      'Validation, JSON + binary serialization, mock data and reflection — generated straight from your TypeScript types. No schemas, no drift.',
    image: '',
  },
  docus: {
    title: 'ts-run-types',
    description:
      'TypeScript decided it is "just a linter". We respectfully bolted the runtime back on.',
    image: '',
    socials: {
      github: 'mionkit/ts-run-types',
      twitter: '@Ma_jrz',
    },
    github: {
      dir: 'website/content',
      branch: 'main',
      repo: 'ts-run-types',
      owner: 'mionkit',
      edit: false
    },
    aside: {
      level: 0,
      collapsed: false,
      exclude: []
    },
    main: {
      padded: true,
      fluid: false
    },
    header: {
      padded: true,
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: false
    },
    footer: {
      textLinks: [
        {
          text: 'Built by Ma Jerez & Contributors',
          href: 'https://github.com/M-jerez',
          target: '_blank'
        },
      ],
      credits: {
        icon: 'icon-park-outline:copyright',
        text: `MIT license - Copyright ${new Date().getFullYear()} mion`,
        href: 'https://github.com/mionkit/ts-run-types/blob/main/LICENSE',
      },
    }
  },
  ui: {
    colors: {
      primary: 'green',
      white: {
        value: "#f7f7ff",
        raw: "#f7f7ff"
      },
      black: {
        value: "#15131a",
        raw: "#15131a"
      },
  }
  },
})
