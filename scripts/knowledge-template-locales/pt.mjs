export default {
  title: "Modelo de conhecimento",
  intro: [
    "Preencha o que se aplica ao seu negócio e deixe o resto em branco. Envie este arquivo em Conhecimento, em Adicionar conhecimento. Sua recepcionista lê suas respostas e ignora notas cinzas como esta.",
    "Escreva frases completas que nomeiem o assunto: “Uma massagem de 60 minutos custa R$ 90”, e não “R$ 90”. Informe números com unidades e uma data para tudo que expira. Evite tabelas, imagens e “veja nosso site”. Digite o conteúdo aqui.",
  ],
  sections: {
    about: {
      title: "Sobre o negócio",
      hint: "Diga quem você é em palavras simples. Quem liga ouve isso ao perguntar o que você faz.",
      prompts: [
        "Nome do negócio",
        "O que seu negócio faz e para quem é?",
        "Quais cidades ou regiões você atende?",
        "Há quanto tempo você atua e o que, segundo os clientes, diferencia você?",
        "Quais idiomas sua equipe fala?",
        "Como os clientes podem falar com você além de ligar (e-mail, site, redes sociais)?",
      ],
    },
    location: {
      title: "Localização e acesso",
      hint: "Horários e fechamentos ficam no seu painel. Acrescente aqui os detalhes que quem liga pergunta além deles.",
      prompts: [
        "Qual é o seu endereço completo e quais pontos de referência ou cruzamentos ajudam a encontrar você?",
        "Onde os clientes podem estacionar e quanto custa?",
        "O local é acessível (entrada sem degraus, elevador, banheiro acessível)?",
        "Você tem mais de uma unidade? Informe o endereço de cada uma.",
        "Você atende na casa dos clientes? Informe as regiões e a taxa de deslocamento, se houver.",
      ],
    },
    services: {
      title: "Serviços em detalhe",
      hint: "Sua lista de serviços fica no seu painel. Descreva cada serviço aqui. Comece cada resposta com o nome do serviço para que ela faça sentido sozinha. Copie o bloco para cada serviço adicional.",
      prompts: [
        "Nome do serviço",
        "O que inclui",
        "Quanto tempo leva",
        "Preço ou faixa de preço",
        "Para quem serve e para quem não serve",
        "O que preparar ou levar",
        "O que acontece depois",
      ],
    },
    pricing: {
      title: "Preços e pagamento",
      prompts: [
        "Quais formas de pagamento você aceita?",
        "Você cobra sinal ou taxa de reserva? Informe o valor e quando é devido.",
        "Você faz orçamentos ou estimativas gratuitas? Como o cliente consegue um?",
        "Quais convênios, planos de associação ou opções de financiamento você aceita?",
        "Quais descontos, pacotes ou promoções estão ativos? Informe as datas de término.",
      ],
    },
    booking: {
      title: "Reservas e agendamento",
      prompts: [
        "Como os novos clientes agendam e o que precisam ter em mãos?",
        "Com quanta antecedência os clientes devem agendar e em quanto tempo costuma haver o próximo horário?",
        "Você atende sem hora marcada ou pedidos para o mesmo dia?",
        "Qual é a sua política de cancelamento e remarcação? Informe o aviso necessário e qualquer taxa.",
        "O que acontece quando um cliente chega atrasado ou não aparece?",
        "Os clientes podem levar crianças, acompanhantes ou animais de estimação?",
        "Você aceita agendamentos em grupo, recorrentes ou fora do horário de atendimento?",
      ],
    },
    policies: {
      title: "Políticas",
      prompts: [
        "Qual é a sua política de reembolso, devolução ou garantia?",
        "Quais exigências de documento, idade ou elegibilidade se aplicam?",
        "Quais regras de saúde, segurança ou conduta os clientes precisam conhecer?",
      ],
    },
    team: {
      title: "Equipe",
      hint: "Os membros da sua equipe ficam no seu painel. Acrescente o que quem liga pede pelo nome ou pela necessidade.",
      prompts: [
        "Por quem quem liga deve perguntar em situações específicas? Exemplo: para agendamentos de casamento, pergunte pela Maria.",
        "Quais membros da equipe têm especialidades ou certificações sobre as quais os clientes perguntam?",
      ],
    },
    urgent: {
      title: "Situações urgentes e fora do horário",
      prompts: [
        "O que conta como urgência ou emergência e o que quem liga deve fazer primeiro?",
        "O que a recepcionista deve dizer a quem liga fora do horário?",
      ],
    },
    limits: {
      title: "Limites e encaminhamentos",
      hint: "Diga à recepcionista onde parar. Nomeie o assunto e o motivo.",
      prompts: [
        "Quais pedidos precisam ir para uma pessoa? Exemplo: reclamações, disputas de cobrança, perguntas jurídicas ou médicas.",
        "O que a recepcionista nunca deve prometer ou informar? Exemplo: preços exatos por telefone, resultados garantidos.",
        "O que você precisa saber de quem liga antes de poder ajudar (nome, endereço, veículo, número do pedido)?",
        "Como a recepcionista deve tratar ligações de vendas e de fornecedores?",
      ],
    },
    terms: {
      title: "Nomes, termos e pronúncias",
      prompts: [
        "Quais nomes de negócio, de equipe ou de produto são difíceis de pronunciar? Escreva como dizer cada um.",
        "Quais termos ou siglas do setor os clientes usam e o que significam?",
        "Com quais outros negócios ou marcas os clientes confundem o seu?",
      ],
    },
    news: {
      title: "Novidades",
      hint: "Remova cada item quando ficar desatualizado.",
      prompts: [
        "O que mudou recentemente ou vai mudar (novos serviços, obras, mudanças sazonais, tempos de espera)? Informe as datas.",
      ],
    },
    faq: {
      title: "Perguntas frequentes",
      hint: "Escreva as 10 perguntas que quem liga mais faz e responda cada uma com frases completas. Apague os pares que não usar.",
    },
  },
};
