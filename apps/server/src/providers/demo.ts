import type { Account, Conversation, Message, Participant, ProviderId } from '@foz/core';
import { convId, msgId, type ProviderAdapter, type ProviderContext } from './types.js';

/**
 * Demo provider: seeds realistic conversations that *look like* Slack,
 * Gmail, WhatsApp and Telegram so the UI is fully usable with zero
 * credentials. It also simulates life: new messages trickle in, and
 * anything you send gets a reply a few seconds later.
 */

const ME: Participant = { id: 'me', name: 'Marcus', handle: '@marcus' };

interface Seed {
  kind: Conversation['kind'];
  title: string;
  people: Participant[];
  thread: Array<[who: string | 'me', text: string, minutesAgo: number]>;
  unread?: number;
  starred?: boolean;
  archived?: boolean;
}

const p = (id: string, name: string, handle?: string): Participant => ({ id, name, handle });

const SEEDS: Record<Exclude<ProviderId, 'demo' | 'discord'>, Seed[]> = {
  slack: [
    {
      kind: 'channel',
      title: '#eng-platform',
      people: [p('ana', 'Ana Ribeiro', '@ana'), p('caio', 'Caio Mendes', '@caio'), p('lu', 'Luiza Prado', '@luiza')],
      unread: 3,
      thread: [
        ['ana', 'Deploy da v2.3 foi pro ar às 10:15, monitorando os dashboards', 190],
        ['caio', 'p95 subiu de 120ms pra 180ms no /search depois do deploy 👀', 175],
        ['me', 'Deve ser o índice novo. Vou olhar o plano da query', 170],
        ['ana', 'Confirmado: EXPLAIN mostra seq scan na tabela de conversas', 60],
        ['lu', '@marcus consegue subir um hotfix hoje ainda? Temos a demo pro cliente às 16h', 22],
        ['caio', 'Se precisar de par eu tô livre até as 15h', 12],
      ],
    },
    {
      kind: 'dm',
      title: 'Luiza Prado',
      people: [p('lu', 'Luiza Prado', '@luiza')],
      unread: 1,
      starred: true,
      thread: [
        ['lu', 'Oi! Tem 5 min pra falar do roadmap do Q4?', 400],
        ['me', 'Tenho sim, me manda o doc antes?', 390],
        ['lu', 'Mandei no email, "Roadmap Q4 - rascunho". Dá uma olhada quando puder 🙏', 35],
      ],
    },
    {
      kind: 'channel',
      title: '#random',
      people: [p('pedro', 'Pedro Alves', '@pedro'), p('ana', 'Ana Ribeiro', '@ana')],
      thread: [
        ['pedro', 'Alguém indica um lugar de almoço perto do escritório que não seja o de sempre?', 1500],
        ['ana', 'O árabe da esquina tá bom demais, e é rápido', 1480],
        ['me', 'Apoiado. O kafta de lá é absurdo', 1470],
      ],
    },
    {
      kind: 'group',
      title: 'Caio, Pedro',
      people: [p('caio', 'Caio Mendes', '@caio'), p('pedro', 'Pedro Alves', '@pedro')],
      thread: [
        ['caio', 'Fechou o code review do PR #412?', 2900],
        ['me', 'Fechei, só faltou você rebasear', 2880],
        ['pedro', 'Rebaseado e mergeado 🚀', 2800],
      ],
    },
    {
      kind: 'channel',
      title: '#incidents',
      people: [p('bot', 'PagerBot', '@pagerbot'), p('ana', 'Ana Ribeiro', '@ana')],
      archived: true,
      thread: [
        ['bot', '[RESOLVED] INC-231 Elevated error rate on api-gateway (12 min)', 5000],
        ['ana', 'Root cause: certificado expirado no ingress. Renovado e automatizado.', 4980],
      ],
    },
  ],
  gmail: [
    {
      kind: 'thread',
      title: 'Roadmap Q4 - rascunho',
      people: [p('lu@', 'Luiza Prado', 'luiza@acme.com')],
      unread: 1,
      starred: true,
      thread: [
        ['lu@', 'Oi Marcus,\n\nSegue o rascunho do roadmap do Q4. Os três temas principais:\n\n1. Inbox unificada (Foz!)\n2. Busca semântica nas conversas\n3. App mobile\n\nQueria sua opinião sobre a ordem de prioridade antes de levar pra diretoria.\n\nAbraço,\nLuiza', 40],
      ],
    },
    {
      kind: 'thread',
      title: 'Fatura Nubank - Setembro',
      people: [p('nu', 'Nubank', 'todomundo@nubank.com.br')],
      unread: 1,
      thread: [
        ['nu', 'Sua fatura de setembro fechou.\n\nValor: R$ 2.417,81\nVencimento: 10/09\n\nVocê pode pagar pelo app ou copiar o código de barras abaixo.', 300],
      ],
    },
    {
      kind: 'thread',
      title: 'Re: Proposta de consultoria - DataOps',
      people: [p('rafa', 'Rafael Costa', 'rafael@dataops.io')],
      thread: [
        ['rafa', 'Marcus, obrigado pela conversa de ontem. Anexei a proposta revisada com o escopo de 8 semanas que discutimos.', 2000],
        ['me', 'Rafael, recebido. Vou revisar com o time e retorno até sexta.', 1900],
        ['rafa', 'Perfeito, fico no aguardo. Qualquer dúvida é só chamar.', 1850],
      ],
    },
    {
      kind: 'thread',
      title: 'Convite: Revisão de arquitetura (qui 14h)',
      people: [p('cal', 'Google Calendar', 'calendar-notification@google.com')],
      thread: [['cal', 'Ana Ribeiro convidou você para "Revisão de arquitetura".\nQuinta-feira, 14:00 – 15:00\nSala Iguaçu / Meet', 600]],
    },
    {
      kind: 'thread',
      title: 'Seu pedido foi enviado 📦',
      people: [p('amz', 'Amazon.com.br', 'shipment@amazon.com.br')],
      archived: true,
      thread: [['amz', 'Seu pedido #702-4419 foi enviado e chega até quarta-feira.', 4000]],
    },
  ],
  whatsapp: [
    {
      kind: 'dm',
      title: 'Mãe',
      people: [p('mae', 'Mãe', '+55 41 9****-1234')],
      unread: 2,
      thread: [
        ['mae', 'Oi filho, tudo bem?', 90],
        ['mae', 'Domingo o almoço é aqui em casa, vem?', 88],
      ],
    },
    {
      kind: 'group',
      title: 'Trilha de sábado 🥾',
      people: [p('ju', 'Ju'), p('thi', 'Thiago'), p('bia', 'Bia')],
      unread: 5,
      thread: [
        ['ju', 'Gente, previsão de sol pro sábado!', 240],
        ['thi', 'Bora Pico do Marumbi então?', 230],
        ['bia', 'Marumbi é pesado, e Morro do Anhangava?', 225],
        ['thi', 'Anhangava tá valendo. 7h no ponto de sempre?', 200],
        ['ju', 'Fechado 🙌', 195],
      ],
    },
    {
      kind: 'dm',
      title: 'Dr. Paulo (fisio)',
      people: [p('paulo', 'Dr. Paulo (fisio)')],
      thread: [
        ['paulo', 'Marcus, confirmando sua sessão amanhã às 8h30', 1300],
        ['me', 'Confirmado, obrigado!', 1290],
      ],
    },
    {
      kind: 'dm',
      title: 'Síndico Carlos',
      people: [p('carlos', 'Síndico Carlos')],
      starred: true,
      thread: [
        ['carlos', 'Boa tarde. A manutenção do elevador fica pra terça, das 9h às 12h.', 3000],
      ],
    },
  ],
  telegram: [
    {
      kind: 'channel',
      title: 'Curitiba Dev',
      people: [p('mari', 'Mariana'), p('joao', 'João K.')],
      unread: 1,
      thread: [
        ['mari', 'Meetup de Rust dia 18, alguém vai?', 500],
        ['joao', 'Vou! Tem vaga ainda no sympla', 480],
      ],
    },
    {
      kind: 'dm',
      title: 'Thiago Nunes',
      people: [p('thi', 'Thiago Nunes', '@thiagon')],
      thread: [
        ['thi', 'Mandei o link do repositório do bot no privado', 2600],
        ['me', 'Vi aqui, muito bom. Vou fazer um fork', 2500],
      ],
    },
  ],
};

const REPLIES = [
  'Fechado! 👍',
  'Boa, obrigado por avisar.',
  'Show. Te retorno em instantes.',
  'Perfeito, combinado então.',
  'Hmm, deixa eu ver aqui e te falo.',
  'kkkk ótimo',
  'Pode deixar, já resolvo.',
];

const INCOMING: Array<[ProviderId, string, string, string]> = [
  ['slack', '#eng-platform', 'caio', 'Subi o hotfix na branch fix/search-index, pode revisar?'],
  ['whatsapp', 'Trilha de sábado 🥾', 'bia', 'Alguém leva o protetor solar? Esqueci de comprar'],
  ['slack', 'Luiza Prado', 'lu', 'Consegue dar um retorno sobre o roadmap até amanhã?'],
  ['telegram', 'Curitiba Dev', 'mari', 'Sobraram 3 vagas, corre!'],
  ['whatsapp', 'Mãe', 'mae', 'Vou fazer lasanha 😋'],
  ['gmail', 'Re: Proposta de consultoria - DataOps', 'rafa', 'Marcus, só reforçando: a proposta vale até o fim do mês. Abraço!'],
];

const LABELS: Record<string, string> = {
  slack: 'Slack · acme',
  gmail: 'Gmail · marcus@acme.com',
  whatsapp: 'WhatsApp · +55 41',
  telegram: 'Telegram · @marcus',
};

export function demoAccounts(): Account[] {
  return (Object.keys(SEEDS) as Array<keyof typeof SEEDS>).map((provider) => ({
    id: `demo-${provider}`,
    provider,
    via: 'demo',
    label: LABELS[provider] ?? provider,
    me: ME,
    status: 'connected',
  }));
}

export class DemoAdapter implements ProviderAdapter {
  private ctx?: ProviderContext;
  private timers: NodeJS.Timeout[] = [];
  private seeds: Seed[];
  private incomingIdx = 0;
  private counter = 0;

  /** `simulate` = random incoming messages. Replies to what you send are always on. */
  constructor(public readonly account: Account, private readonly simulate: boolean) {
    this.seeds = SEEDS[account.provider as keyof typeof SEEDS] ?? [];
  }

  async start(ctx: ProviderContext) {
    this.ctx = ctx;
    if (!this.simulate) return;
    const tick = () => {
      this.pushIncoming();
      this.timers.push(setTimeout(tick, 25_000 + Math.random() * 35_000));
    };
    this.timers.push(setTimeout(tick, 20_000 + Math.random() * 20_000));
  }

  async stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private conversationFor(seed: Seed, now = Date.now()): Conversation {
    const external = slug(seed.title);
    const last = seed.thread[seed.thread.length - 1]!;
    return {
      id: convId(this.account.id, external),
      accountId: this.account.id,
      provider: this.account.provider,
      externalId: external,
      kind: seed.kind,
      title: seed.title,
      participants: seed.people,
      snippet: last[1].split('\n')[0]!,
      lastMessageAt: now - last[2] * 60_000,
      unreadCount: seed.unread ?? 0,
      archived: seed.archived ?? false,
      starred: seed.starred ?? false,
    };
  }

  async listConversations(): Promise<Conversation[]> {
    return this.seeds.map((s) => this.conversationFor(s));
  }

  async fetchMessages(conversation: Conversation, sinceTs: number): Promise<Message[]> {
    const seed = this.seeds.find((s) => slug(s.title) === conversation.externalId);
    if (!seed) return [];
    const now = Date.now();
    return seed.thread
      .map(([who, text, minutesAgo], i): Message => {
        const ts = now - minutesAgo * 60_000;
        const from = who === 'me' ? ME : (seed.people.find((pp) => pp.id === who) ?? p(who, who));
        return {
          id: msgId(conversation.id, `seed-${i}`),
          conversationId: conversation.id,
          externalId: `seed-${i}`,
          from,
          text,
          ts,
          isMine: who === 'me',
          attachments: [],
          subject: seed.kind === 'thread' && i === 0 ? seed.title : undefined,
        };
      })
      .filter((m) => m.ts > sinceTs);
  }

  async send(conversation: Conversation, text: string): Promise<Message> {
    const ext = `sent-${Date.now()}-${(this.counter += 1)}`;
    const msg: Message = {
      id: msgId(conversation.id, ext),
      conversationId: conversation.id,
      externalId: ext,
      from: ME,
      text,
      ts: Date.now(),
      isMine: true,
      attachments: [],
      status: 'sent',
    };
    const seed = this.seeds.find((s) => slug(s.title) === conversation.externalId);
    const who = seed?.people[0];
    if (who) {
      const t = setTimeout(() => {
        this.emit(conversation, who, REPLIES[Math.floor(Math.random() * REPLIES.length)]!);
      }, 2500 + Math.random() * 4000);
      this.timers.push(t);
    }
    return msg;
  }

  private pushIncoming() {
    const mine = INCOMING.filter(([prov]) => prov === this.account.provider);
    if (!mine.length) return;
    const [, title, who, text] = mine[this.incomingIdx % mine.length]!;
    this.incomingIdx += 1;
    const seed = this.seeds.find((s) => s.title === title);
    if (!seed) return;
    const conv = this.conversationFor(seed);
    const from = seed.people.find((pp) => pp.id === who) ?? p(who, who);
    this.emit(conv, from, text);
  }

  private emit(conversation: Conversation, from: Participant, text: string) {
    const ext = `live-${Date.now()}-${(this.counter += 1)}`;
    const message: Message = {
      id: msgId(conversation.id, ext),
      conversationId: conversation.id,
      externalId: ext,
      from,
      text,
      ts: Date.now(),
      isMine: false,
      attachments: [],
    };
    this.ctx?.onMessage({ ...conversation, snippet: text.split('\n')[0]!, lastMessageAt: message.ts }, message);
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
