const Class = require("../models/Class");
const ClassModule = require("../models/ClassModule");
const ClassLesson = require("../models/ClassLesson");
const Quiz = require("../models/Quiz");
const User = require("../models/User");

const FRONTEND = "https://job-platform-frontend-nine.vercel.app";

function lesson(title, objective, explanation, example, practice, takeaway) {
  return {
    title,
    durationMinutes: 18,
    content: [
      `LEARNING GOAL\n${objective}`,
      `\n\nLESSON\n${explanation}`,
      `\n\nEXAMPLE\n${example}`,
      `\n\nTRY IT\n${practice}`,
      `\n\nKEY TAKEAWAY\n${takeaway}`
    ].join("")
  };
}

function question(questionText, options, correctAnswer, explanation) {
  return { question: questionText, type: "multiple_choice", options, correctAnswer, explanation, difficulty: "easy", required: true, points: 1 };
}

const courses = [
  {
    slug: "aift-business-foundations",
    title: "Business Foundations",
    subtitle: "Turn an idea into a practical, customer-focused business.",
    subject: "Business",
    description: "A beginner-friendly course covering customers, business models, operations, money and a simple action plan.",
    cover: "images/course-business-foundations.webp",
    outcomes: ["Explain how a business creates value", "Identify customers and their needs", "Build a simple business model", "Track basic costs, revenue and profit"],
    modules: [
      { title: "How business works", lessons: [
        lesson("What is a business?", "Explain why businesses exist.", "A business solves a problem or meets a need for a customer. It creates value, delivers that value and receives value back—usually money. A strong business is useful, repeatable and sustainable.", "AIFT helps learners build skills and connect with opportunities. Learners gain useful support, while AIFT builds relationships and services around those needs.", "Write one problem people face and one service that could solve it. Name the customer clearly.", "Start with a real customer problem, not only a product idea."),
        lesson("Customers and value", "Describe a target customer and value proposition.", "A target customer is the specific person or organization you serve. A value proposition is the clear benefit they receive and why your solution is a good choice.", "Instead of saying ‘we teach English,’ say ‘we help bilingual job seekers speak confidently in customer-service interviews.’", "Complete this sentence: We help [customer] achieve [result] by [solution].", "Specific customers and outcomes make an offer easier to understand."),
        lesson("Business models", "Recognize how a business earns and delivers value.", "A business model connects customers, offer, delivery, resources, costs and revenue. Common models include direct sales, subscriptions, service fees, commissions and licensing.", "A training company may charge per course, offer a monthly membership or receive an employer placement fee.", "Choose one idea and list: customer, offer, delivery method, main cost and revenue source.", "A business model shows how every important part works together.")
      ], quiz: [
        question("What should a business idea begin with?", ["A real customer problem", "A large office", "A complicated logo", "A high price"], "A real customer problem", "Useful businesses begin by understanding a need."),
        question("What is a value proposition?", ["A clear customer benefit", "A list of employees", "A tax receipt", "A company password"], "A clear customer benefit", "It explains the value a customer receives."),
        question("Which is a revenue model?", ["Monthly subscription", "Office color", "Meeting length", "Company uniform"], "Monthly subscription", "A subscription explains how money is earned.")
      ]},
      { title: "Running the business", lessons: [
        lesson("Simple operations", "Map the steps needed to deliver a service.", "Operations are the repeatable activities that turn an order into a result. Clear roles, checklists, quality standards and deadlines reduce mistakes.", "For an online class: enroll learner, confirm schedule, deliver lesson, record attendance, assess progress and send feedback.", "Create a six-step checklist for delivering your product or service.", "Reliable systems help a small team serve customers consistently."),
        lesson("Costs, revenue and profit", "Calculate a basic profit.", "Revenue is money earned. Costs are money spent. Profit equals revenue minus costs. Fixed costs stay similar each month; variable costs rise as sales rise.", "If revenue is ₱50,000 and total costs are ₱35,000, profit is ₱15,000.", "A service earns ₱80,000, with ₱25,000 fixed costs and ₱30,000 variable costs. Calculate profit.", "Track cash and profit separately; sales do not automatically mean profit."),
        lesson("Quality and improvement", "Use feedback to improve results.", "Quality means meeting a clear standard consistently. Measure a few useful indicators, collect customer feedback and correct the root cause of repeated problems.", "A support team tracks response time, resolution rate and satisfaction—not only number of messages.", "Choose three indicators for your business and explain what each one reveals.", "Measure what matters, then make one improvement at a time.")
      ], quiz: [
        question("Profit equals:", ["Revenue minus costs", "Costs minus revenue", "Revenue plus costs", "Cash plus inventory"], "Revenue minus costs", "Profit is the amount remaining after costs."),
        question("Why use an operations checklist?", ["To deliver consistently", "To increase confusion", "To hide responsibilities", "To avoid customers"], "To deliver consistently", "Checklists reduce missed steps and errors."),
        question("Which is a useful quality measure?", ["Customer satisfaction", "Desk color", "Logo size", "Employee shoe size"], "Customer satisfaction", "It reflects the customer experience.")
      ]},
      { title: "Plan and grow", lessons: [
        lesson("Goals and priorities", "Turn a broad goal into measurable actions.", "A useful goal is specific, measurable, achievable, relevant and time-bound. Priorities protect the team from trying to do everything at once.", "‘Gain 10 qualified employer meetings in 30 days’ is clearer than ‘grow quickly.’", "Rewrite one broad goal using a number and deadline. Add the first three actions.", "Clear measures and deadlines make progress visible."),
        lesson("Risk and ethical decisions", "Identify business risks and responsible responses.", "Risks may involve money, operations, reputation, security or law. Good leaders reduce harm, protect personal data, keep promises and communicate honestly.", "A company does not claim guaranteed jobs when it only provides training and introductions.", "List three risks for your idea, their impact and one prevention step for each.", "Trust grows when decisions are honest, safe and accountable."),
        lesson("Your one-page business plan", "Create a practical first plan.", "A one-page plan summarizes the customer, problem, solution, advantage, delivery, marketing, costs, revenue, goals and risks. It should guide action, not remain a document.", "A training startup tests one course with 20 learners before investing in a larger facility.", "Draft your one-page plan and choose one low-cost test you can run this week.", "Test assumptions early and improve the plan using real evidence.")
      ], quiz: [
        question("Which goal is most measurable?", ["Win 10 meetings in 30 days", "Become better", "Work harder", "Be famous"], "Win 10 meetings in 30 days", "It includes a number and deadline."),
        question("What belongs in a one-page plan?", ["Customer, offer, costs and revenue", "Only a logo", "Only the founder biography", "Passwords"], "Customer, offer, costs and revenue", "The plan connects the essential business parts."),
        question("Why run a small test?", ["To learn with lower risk", "To guarantee success", "To avoid customers", "To remove all costs"], "To learn with lower risk", "A small test provides evidence before a larger commitment.")
      ]}
    ]
  },
  {
    slug: "aift-customer-service-excellence",
    title: "Customer Service Excellence",
    subtitle: "Communicate with empathy, solve problems and build trust.",
    subject: "Customer Service",
    description: "Practical service skills for calls, chat and email, including discovery, de-escalation, resolution and quality.",
    cover: "images/course-customer-service.webp",
    outcomes: ["Use a professional service structure", "Ask effective discovery questions", "Handle difficult conversations calmly", "Document and follow up accurately"],
    modules: [
      { title: "Service essentials", lessons: [
        lesson("The customer journey", "See service from the customer’s point of view.", "The journey includes every interaction before, during and after a purchase. Customers judge both the solution and how easy, respectful and clear the process feels.", "A refund may be correct, but unclear updates can still create a poor experience.", "Map five steps a customer takes when asking for help. Mark one possible frustration at each step.", "Great service improves the whole journey, not only one conversation."),
        lesson("A professional opening", "Open a conversation with confidence.", "Greet the customer, introduce yourself, acknowledge the reason for contact and show readiness to help. Use a natural tone and avoid sounding rushed.", "‘Thank you for contacting AIFT. My name is Ana. I understand you need help accessing your class, and I’ll check that with you.’", "Write openings for a call, a live chat and an email.", "A clear opening creates trust and sets the direction."),
        lesson("Listening and discovery", "Find the real issue before offering a solution.", "Use open questions for context, closed questions for confirmation and paraphrasing to verify understanding. Do not interrupt or assume.", "‘When did the error begin?’ followed by ‘So the login works, but the course page does not open—is that correct?’", "Create three open questions and two confirmation questions for a delivery problem.", "Understand first; solve second.")
      ], quiz: [
        question("What should happen before offering a solution?", ["Understand the issue", "End the conversation", "Transfer immediately", "Blame the customer"], "Understand the issue", "Discovery prevents incorrect solutions."),
        question("Which question invites detail?", ["What happened before the error appeared?", "Is it yes?", "Did you click?", "Can I close this?"], "What happened before the error appeared?", "Open questions help customers explain context."),
        question("A strong opening should include:", ["Acknowledgement and readiness to help", "An argument", "A sales pitch only", "Private account data"], "Acknowledgement and readiness to help", "It shows attention and sets expectations.")
      ]},
      { title: "Resolution skills", lessons: [
        lesson("Empathy and ownership", "Show care without making false promises.", "Empathy recognizes the customer’s experience. Ownership means guiding the issue to the next clear step, even when another team must help.", "‘I understand why this delay is frustrating. I will document the details and update you by 3 p.m.’", "Rewrite ‘That is not my department’ as an ownership statement.", "Acknowledge feelings, state what you can do and give a realistic next step."),
        lesson("De-escalating difficult conversations", "Respond calmly to anger or frustration.", "Lower your pace, avoid matching anger, acknowledge the concern, focus on facts and offer choices when possible. Set respectful boundaries if there is abuse.", "‘I want to help resolve this. We can review the charge now or arrange a billing callback—which works better?’", "Write a response to a customer who has repeated the same problem three times.", "Calm structure gives the conversation a path forward."),
        lesson("Explaining the solution", "Give instructions that are easy to follow.", "Use short steps, plain language and one action at a time. Confirm the result after important steps and summarize what will happen next.", "Instead of ‘clear cache,’ explain where to tap, what will be removed and why it may fix the page.", "Turn a five-step technical instruction into numbered, customer-friendly language.", "A solution is only useful when the customer can understand and complete it.")
      ], quiz: [
        question("Empathy means:", ["Recognizing the customer’s experience", "Agreeing with every demand", "Giving a false promise", "Ignoring emotion"], "Recognizing the customer’s experience", "Empathy acknowledges the impact without inventing promises."),
        question("What helps de-escalate anger?", ["A calm pace and clear choices", "Speaking faster", "Arguing", "Interrupting"], "A calm pace and clear choices", "Calm structure reduces tension."),
        question("Good instructions should be:", ["Short and sequential", "Vague and technical", "Given all at once", "Unconfirmed"], "Short and sequential", "Customers can follow one clear action at a time.")
      ]},
      { title: "Quality conversations", lessons: [
        lesson("Writing for chat and email", "Write concise, warm service messages.", "Lead with the answer or next step, use short paragraphs, check names and details, and end with a clear action. Avoid unexplained abbreviations.", "Subject: Reset link sent. Body: ‘We sent a secure link to your registered email. It expires in 30 minutes.’", "Edit a long support message into three short paragraphs with one clear next action.", "Clarity and accuracy matter more than complicated language."),
        lesson("Documentation and follow-up", "Create notes another agent can use.", "Record the issue, checks completed, result, promise and next owner. Never include passwords, full payment details or unnecessary sensitive information.", "‘Login error; email verified; reset sent 10:20; customer will retry; follow up tomorrow if unresolved.’", "Write a six-line case note for a delayed order.", "Good notes prevent repetition and protect the customer."),
        lesson("Service quality and coaching", "Use feedback to improve performance.", "Quality reviews should examine accuracy, empathy, compliance, efficiency and resolution. Coaching works best with one observed behavior and one practice goal.", "Instead of ‘be better,’ coach: ‘Confirm the customer’s understanding before closing every call this week.’", "Review a recent conversation and identify one strength and one measurable improvement.", "Quality is a habit built through specific feedback and practice.")
      ], quiz: [
        question("What belongs in a case note?", ["Issue, actions and next step", "Customer password", "Personal opinions", "Unneeded card data"], "Issue, actions and next step", "Useful notes are factual and safe."),
        question("The best coaching goal is:", ["Confirm understanding before closing", "Try harder", "Never make mistakes", "Talk more"], "Confirm understanding before closing", "Specific behavior can be observed and practiced."),
        question("A service email should lead with:", ["The answer or next step", "A long company history", "Technical jargon", "An unrelated offer"], "The answer or next step", "Customers need clarity quickly.")
      ]}
    ]
  },
  {
    slug: "aift-practical-english-communication",
    title: "Practical English Communication",
    subtitle: "Speak and write clearly in everyday and professional situations.",
    subject: "English",
    description: "An accessible English course covering sentence building, useful tenses, conversations and professional communication.",
    cover: "images/course-practical-english.webp",
    outcomes: ["Build clear English sentences", "Use essential tenses accurately", "Ask and answer questions naturally", "Write professional messages"],
    modules: [
      { title: "Build clear sentences", lessons: [
        lesson("Subject, verb and object", "Build a complete basic sentence.", "Many English statements follow subject + verb + object. The subject performs the action, the verb shows the action and the object receives it.", "‘Prince manages the project.’ Prince is the subject, manages is the verb and project is the object.", "Write five sentences about work or study. Underline each verb.", "Start with a clear subject and verb; add details after the core idea."),
        lesson("Present simple", "Describe routines, facts and regular actions.", "Use the base verb with I/you/we/they. Add -s or -es with he/she/it. Use do or does for questions and negatives.", "‘She works online.’ ‘Does she work online?’ ‘She does not work on Sunday.’", "Write three routines, two questions and two negative sentences.", "Remember the third-person -s in affirmative sentences, not after does."),
        lesson("Useful vocabulary strategies", "Learn and remember words in context.", "Learn phrases rather than isolated words, record a simple meaning, make a personal example and review it over several days.", "Learn ‘follow up with a customer,’ not only ‘follow.’", "Choose five new words. For each, write one common phrase and one personal sentence.", "Context and repeated use turn new words into active vocabulary.")
      ], quiz: [
        question("Which sentence is correct?", ["She works online.", "She work online.", "She working online.", "She does works online."], "She works online.", "He, she and it take -s in the present simple affirmative."),
        question("What is the verb in ‘AIFT supports learners’?", ["supports", "AIFT", "learners", "the"], "supports", "The verb expresses the action."),
        question("The best way to learn ‘follow up’ is:", ["Use it in a meaningful phrase", "Memorize one translation only", "Never say it", "Ignore context"], "Use it in a meaningful phrase", "Context makes vocabulary easier to remember and use.")
      ]},
      { title: "Talk about time", lessons: [
        lesson("Past simple", "Describe completed past actions.", "Use the past form for a finished action at a finished time. Regular verbs often end in -ed; irregular verbs change form. Use did for questions and negatives.", "‘We launched the class last month.’ ‘Did you attend?’ ‘I did not miss a lesson.’", "Write a short five-sentence story about yesterday using at least two irregular verbs.", "After did or did not, use the base verb."),
        lesson("Future forms", "Choose a natural way to discuss the future.", "Use will for quick decisions and predictions, be going to for plans and evidence, and the present continuous for arranged events.", "‘I’ll answer the phone.’ ‘We are going to launch a course.’ ‘I am meeting the client at 2.’", "Write one prediction, one plan and one arranged appointment.", "Choose the future form based on meaning, not only time."),
        lesson("Present perfect", "Connect past experience or results to now.", "Use have/has + past participle for experience, unfinished time and a present result. Avoid a finished past time such as yesterday with the present perfect.", "‘I have completed three courses.’ ‘She has just sent the report.’", "Write two life experiences and two recent results using already, yet or just.", "Use past simple for a finished time; use present perfect when the connection to now matters.")
      ], quiz: [
        question("Which is correct?", ["Did you attend?", "Did you attended?", "Did attended you?", "You did attended?"], "Did you attend?", "Use the base verb after did."),
        question("Which expresses an arrangement?", ["I am meeting her at 2.", "I meet her yesterday.", "I have meet her.", "I meeting her."], "I am meeting her at 2.", "Present continuous can describe a fixed future arrangement."),
        question("Which fits present perfect?", ["I have just finished.", "I have finished yesterday.", "I did just finished.", "I has finished."], "I have just finished.", "Just commonly connects a recent result to now.")
      ]},
      { title: "Communicate confidently", lessons: [
        lesson("Questions and active listening", "Keep a conversation clear and natural.", "Use open questions to invite detail and follow-up questions to show interest. Listen for the main idea before planning your answer.", "‘What do you enjoy about your work?’ followed by ‘How did you learn that skill?’", "Prepare five questions for meeting a new colleague. Practice asking them aloud.", "Good communication is listening and responding, not only speaking."),
        lesson("Professional email", "Write a clear, polite email.", "Use a useful subject, greeting, purpose, necessary details, clear request and closing. Keep paragraphs short and check tone before sending.", "Subject: Meeting confirmation. ‘Hello Maria, I’m confirming our call for Tuesday at 10 a.m. Please let me know if the time changes.’", "Write an email requesting a document by Friday and explain why it is needed.", "Make the purpose and requested action easy to find."),
        lesson("Speaking practice plan", "Build fluency through short daily practice.", "Fluency grows through frequent speaking, useful phrases, recording yourself and correcting one pattern at a time. Accuracy and confidence develop together.", "Record a one-minute introduction, listen once for clarity and record it again with one improvement.", "Create a seven-day plan with ten minutes of speaking practice each day.", "Small, consistent practice is more effective than waiting to feel perfect.")
      ], quiz: [
        question("An open question usually:", ["Invites a detailed answer", "Requires only yes or no", "Ends the conversation", "Changes the subject"], "Invites a detailed answer", "Open questions encourage explanation."),
        question("A professional email needs:", ["A clear purpose and action", "Many long paragraphs", "No subject", "Slang only"], "A clear purpose and action", "The reader should understand why you wrote and what happens next."),
        question("What improves speaking fluency?", ["Short, consistent practice", "Avoiding speech", "Memorizing without use", "Waiting for perfection"], "Short, consistent practice", "Regular production and reflection build fluency.")
      ]}
    ]
  },
  {
    slug: "aift-marketing-fundamentals",
    title: "Marketing Fundamentals",
    subtitle: "Reach the right audience with a clear message and measurable plan.",
    subject: "Marketing",
    description: "Learn audience research, positioning, content, channels, campaigns and ethical measurement through practical activities.",
    cover: "images/course-marketing-fundamentals.webp",
    outcomes: ["Define a useful target audience", "Create clear positioning and messages", "Plan content across suitable channels", "Measure and improve a campaign"],
    modules: [
      { title: "Know the market", lessons: [
        lesson("Marketing and customer value", "Explain what marketing really does.", "Marketing identifies a customer need, shapes a valuable offer, communicates it and supports a lasting relationship. Promotion is only one part.", "Research may show job seekers need interview practice more than another grammar lecture, changing the offer itself.", "Choose a product and list the need, value, message and relationship activity.", "Good marketing begins before the advertisement."),
        lesson("Audience research", "Create an evidence-based audience profile.", "Use interviews, observation, surveys and existing data to understand goals, barriers, behavior and decision factors. Separate evidence from assumptions.", "A learner may want English not for travel but to qualify for a bilingual support role.", "Interview one potential customer using five neutral questions. Record what surprised you.", "Ask before assuming; real language from customers improves the offer and message."),
        lesson("Segmentation and positioning", "Choose who an offer is for and how it should be understood.", "Segments group people by meaningful needs or behavior. Positioning defines the specific place you want the offer to hold in their mind compared with alternatives.", "‘Practical customer-service English for bilingual job seekers’ is more focused than ‘English for everyone.’", "Write: For [audience], [offer] is the [category] that [benefit] because [reason to believe].", "Focus makes marketing more relevant and memorable.")
      ], quiz: [
        question("Marketing starts with:", ["Customer needs", "Random posting", "A discount only", "A logo only"], "Customer needs", "Research and value come before promotion."),
        question("A segment groups people by:", ["Meaningful needs or behavior", "Random choice", "Favorite color only", "Employee opinion"], "Meaningful needs or behavior", "Useful segments guide different offers or messages."),
        question("Positioning should clarify:", ["Who it is for and why it matters", "Only the company address", "Every possible feature", "A password"], "Who it is for and why it matters", "Strong positioning is focused and relevant.")
      ]},
      { title: "Create the message", lessons: [
        lesson("Benefits, proof and calls to action", "Build a persuasive but honest message.", "Lead with the outcome, explain how it works, provide credible proof and ask for one clear next action. Do not use guaranteed claims without evidence.", "‘Practice real support scenarios, receive coaching and prepare for interviews. View the course outline.’", "Rewrite a feature-only description into benefit + proof + call to action.", "Clarity and credibility persuade better than exaggeration."),
        lesson("Content planning", "Plan useful content for different stages.", "Awareness content names a problem, consideration content explains options and decision content reduces final uncertainty. One strong idea can be adapted to several formats.", "A customer-service course can use a short tip video, a comparison guide and a detailed curriculum page.", "Create three content ideas—one for awareness, one for consideration and one for decision.", "Match content to the audience’s current question."),
        lesson("Channels and consistency", "Choose channels based on audience behavior.", "Use channels where the audience already pays attention and where the format fits. Keep the core promise and visual identity consistent while adapting the message.", "LinkedIn may fit employer partnerships, while short educational video may reach early-career learners.", "Choose two channels and explain the audience, format, frequency and goal for each.", "Do fewer channels well before expanding everywhere.")
      ], quiz: [
        question("A strong call to action is:", ["One clear next step", "Five unrelated choices", "A hidden link", "No action"], "One clear next step", "A focused action reduces uncertainty."),
        question("Decision-stage content should:", ["Reduce final uncertainty", "Only entertain", "Avoid product details", "Target everyone"], "Reduce final uncertainty", "It helps the audience decide confidently."),
        question("Choose a channel based mainly on:", ["Audience behavior and content fit", "Trend alone", "Founder preference only", "Logo color"], "Audience behavior and content fit", "The right channel connects message, format and audience.")
      ]},
      { title: "Run and improve campaigns", lessons: [
        lesson("Campaign goals and plans", "Create a focused campaign plan.", "Define one audience, one objective, one offer, main message, channels, timeline, owner and budget. Connect every activity to the objective.", "Objective: receive 30 qualified course inquiries in four weeks—not simply ‘get more likes.’", "Draft a campaign brief with an objective, audience, offer, message and two channels.", "A measurable objective keeps the campaign coherent."),
        lesson("Metrics that matter", "Select measures that reflect the objective.", "Reach shows exposure, engagement shows interaction, conversion shows desired action and retention shows continued value. Vanity metrics may look impressive without business impact.", "If the goal is enrollment, completed applications matter more than video views alone.", "For your campaign, choose one leading metric and one outcome metric. Explain why.", "Measure the behavior closest to the real goal."),
        lesson("Testing and ethical marketing", "Improve results without misleading people.", "Test one meaningful variable at a time, compare fairly and document learning. Protect privacy, identify sponsorships and avoid fake urgency, hidden fees or discriminatory targeting.", "Test two headlines with the same audience and offer; keep the version that produces more qualified inquiries.", "Design one A/B test and list the ethical checks required before launch.", "Sustainable marketing earns attention and trust together.")
      ], quiz: [
        question("Which objective is measurable?", ["Receive 30 qualified inquiries", "Become popular", "Post more", "Look successful"], "Receive 30 qualified inquiries", "It defines a count and meaningful action."),
        question("If the goal is enrollment, prioritize:", ["Completed applications", "Views only", "Logo impressions", "Number of colors"], "Completed applications", "Conversion is closest to the stated goal."),
        question("A fair A/B test changes:", ["One meaningful variable", "Everything at once", "The result after launch", "Customer data secretly"], "One meaningful variable", "One controlled change makes the result interpretable.")
      ]}
    ]
  },
  {
    slug: "aift-economics-made-simple",
    title: "Economics Made Simple",
    subtitle: "Understand choices, markets, money and the wider economy.",
    subject: "Economics",
    description: "A practical introduction to scarcity, supply and demand, inflation, growth, trade and everyday economic decisions.",
    cover: "images/course-economics-made-simple.webp",
    outcomes: ["Explain scarcity and opportunity cost", "Use supply and demand to understand prices", "Describe inflation, unemployment and growth", "Make better personal and business decisions"],
    modules: [
      { title: "Choices and markets", lessons: [
        lesson("Scarcity and opportunity cost", "Explain why every choice has a trade-off.", "Resources such as time, money and labor are limited, while wants are numerous. Opportunity cost is the best alternative given up when a choice is made.", "Using ₱1,000 for advertising means it cannot also buy equipment. The value of the best alternative is the opportunity cost.", "Describe one decision you made this week and the best alternative you gave up.", "Economic thinking compares benefits with real alternatives."),
        lesson("Supply, demand and price", "Understand how buyers and sellers influence price.", "Demand describes how much buyers want at different prices. Supply describes how much sellers offer. Price tends toward the point where quantity demanded and supplied meet.", "If concert demand rises while seats stay fixed, ticket prices and competition for seats tend to rise.", "Choose a common product and predict what happens if demand increases but supply stays unchanged.", "Prices carry information about scarcity and willingness to buy."),
        lesson("Incentives and behavior", "Recognize how rules and rewards affect choices.", "An incentive changes the cost or benefit of an action. Incentives can be financial, social or practical, and may create unintended results.", "A discount may increase sales, but an unclear limited offer may also reduce trust.", "Identify one incentive at work or school and one intended and unintended effect.", "Always examine how people may respond, not only what a policy intends.")
      ], quiz: [
        question("Opportunity cost is:", ["The best alternative given up", "Every possible choice", "Only money spent", "A guaranteed loss"], "The best alternative given up", "It captures the value of the next-best option."),
        question("If demand rises and supply is fixed, price often:", ["Rises", "Falls to zero", "Disappears", "Never changes"], "Rises", "More buyers compete for the same available quantity."),
        question("An incentive changes:", ["The cost or benefit of an action", "The past", "A person’s name", "The weather"], "The cost or benefit of an action", "People respond to changing rewards and constraints.")
      ]},
      { title: "The wider economy", lessons: [
        lesson("Growth and productivity", "Explain how economies produce more value.", "Economic growth is an increase in production over time. Productivity is output per unit of input and improves through skills, technology, infrastructure and better organization.", "A trained agent using a reliable CRM may resolve more cases accurately in the same time.", "List two investments that could increase productivity in a small company.", "Long-term living standards depend strongly on productive capacity."),
        lesson("Inflation and purchasing power", "Understand why the same money may buy less.", "Inflation is a broad, sustained rise in prices. Purchasing power falls when income grows more slowly than prices. One price change alone is not necessarily inflation.", "If prices rise 6% while income rises 2%, a household can generally afford less than before.", "Compare a monthly budget before and after a 5% increase in food and transport costs.", "Plan using real purchasing power, not only the number printed on income."),
        lesson("Employment and the business cycle", "Describe changes in economic activity and jobs.", "Economies move through expansions and slowdowns. Unemployment measures people seeking work who cannot find it, while underemployment includes people working less than they need or below their capacity.", "A slowdown may reduce customer demand, causing firms to delay hiring.", "Explain how a slowdown could affect one household and one business differently.", "Economic indicators describe patterns, but the human effects are uneven.")
      ], quiz: [
        question("Productivity means:", ["Output per unit of input", "Higher prices only", "More meetings", "Longer hours automatically"], "Output per unit of input", "Productivity compares useful output with resources used."),
        question("Inflation is:", ["A broad sustained rise in prices", "One sale ending", "One product changing", "Every salary increase"], "A broad sustained rise in prices", "Inflation concerns the general price level over time."),
        question("Underemployment can mean:", ["Working fewer hours than needed", "Choosing a holiday", "Owning a business", "Studying economics"], "Working fewer hours than needed", "A person may be employed but not have sufficient or suitable work.")
      ]},
      { title: "Economic decisions", lessons: [
        lesson("Interest, saving and borrowing", "Compare financial choices over time.", "Interest rewards saving or adds to borrowing cost. Compound interest applies to the balance plus earlier interest. Compare total repayment, fees and risk—not only the monthly amount.", "A low monthly payment over a much longer term can cost more overall.", "Compare two sample loans using total amount repaid and list one risk of each.", "Time and interest can significantly change the true cost of money."),
        lesson("Government, taxes and public goods", "Explain why governments participate in the economy.", "Governments collect taxes, provide services, set rules and may address market failures. Public goods are difficult to exclude people from and can serve many people together.", "Street lighting and national defense are common public-good examples.", "Choose one public service and explain its benefit, cost and who should be accountable for quality.", "Public decisions involve both resources and shared priorities."),
        lesson("Trade and everyday analysis", "Use economic thinking without oversimplifying.", "Trade allows specialization and exchange, but benefits and costs may be distributed unevenly. Good analysis identifies stakeholders, evidence, alternatives, short-term effects and long-term effects.", "Imported equipment may lower business costs while creating pressure for a local producer.", "Analyze one current price change using supply, demand, incentives and affected groups.", "Ask who benefits, who bears costs and what evidence could change your conclusion.")
      ], quiz: [
        question("When comparing loans, check:", ["Total repayment, fees and risk", "Monthly payment only", "Advertisement color", "Bank logo only"], "Total repayment, fees and risk", "The full cost may differ from the most visible number."),
        question("Which is a common public good?", ["Street lighting", "A private meal", "A personal phone", "A single ticket"], "Street lighting", "Many people benefit and exclusion is difficult."),
        question("Good economic analysis asks:", ["Who benefits and who bears costs", "Only who speaks first", "Only today’s price", "No alternative questions"], "Who benefits and who bears costs", "Distribution and alternatives are central to careful analysis.")
      ]}
    ]
  }
];

async function createCourse(provider, definition) {
  let course;
  try {
    course = await Class.create({
      schoolId: provider._id,
      teacherId: null,
      title: definition.title,
      subtitle: definition.subtitle,
      subject: definition.subject,
      category: definition.subject,
      description: definition.description,
      welcomeContent: `Welcome to ${definition.title}. Work through each short lesson, complete the practice activity and use the module quizzes to check your understanding.`,
      learningOutcomes: definition.outcomes,
      level: "Beginner",
      language: "English",
      coverImage: `${FRONTEND}/${definition.cover}`,
      bannerImage: `${FRONTEND}/${definition.cover}`,
      estimatedDurationMinutes: definition.modules.reduce((total, module) => total + module.lessons.reduce((sum, item) => sum + item.durationMinutes, 0), 0),
      published: true,
      status: "active",
      publicationSource: "admin",
      publicationRequestStatus: "approved",
      publicationReviewedAt: new Date(),
      publicationReviewedBy: provider._id,
      enrollmentSettings: { accessType: "public", autoApprove: true, maximumStudents: 0 },
      publishingSettings: { visibility: "public", slug: definition.slug, metaTitle: `${definition.title} | AIFT Learning`, metaDescription: definition.description },
      learningSettings: { sequentialLessons: false, allowLessonSkipping: true, allowReplay: true, autoCompleteLessons: false, allowDownloads: true, discussionsEnabled: true, notesEnabled: true, bookmarksEnabled: true, certificatesEnabled: true, gamificationEnabled: true, completionRule: "all_lessons", completionPercentage: 100 },
      assessmentSettings: { assignmentsEnabled: false, quizzesEnabled: true, defaultQuizAttempts: 3, defaultPassingScore: 70, randomizeQuestions: false, shuffleAnswers: false, showCorrectAnswers: true, releaseGradesAutomatically: true, peerReviewEnabled: false },
      appearanceSettings: { accentColor: "#0874e8", theme: "light", thumbnailImage: `${FRONTEND}/${definition.cover}`, showInstructor: false, showProgress: true },
      pricingSettings: { accessType: "free", amount: 0, currency: "PHP" }
    });

    for (let moduleIndex = 0; moduleIndex < definition.modules.length; moduleIndex += 1) {
      const moduleDefinition = definition.modules[moduleIndex];
      const module = await ClassModule.create({ schoolId: provider._id, classId: course._id, title: moduleDefinition.title, description: `${moduleDefinition.lessons.length} practical lessons and a knowledge check`, order: moduleIndex, status: "published", isLocked: false });
      for (let lessonIndex = 0; lessonIndex < moduleDefinition.lessons.length; lessonIndex += 1) {
        const lessonDefinition = moduleDefinition.lessons[lessonIndex];
        await ClassLesson.create({ schoolId: provider._id, classId: course._id, moduleId: module._id, title: lessonDefinition.title, summary: lessonDefinition.content.slice(0, 500), content: lessonDefinition.content, coverUrl: `${FRONTEND}/${definition.cover}`, order: lessonIndex, durationMinutes: lessonDefinition.durationMinutes, status: "published", previewEnabled: moduleIndex === 0 && lessonIndex === 0 });
      }
      await Quiz.create({ schoolId: provider._id, classId: course._id, moduleId: module._id, title: `${moduleDefinition.title} knowledge check`, instructions: "Choose the best answer. You need 70% to pass and may try again.", questions: moduleDefinition.quiz, passingScore: 70, timeLimitMinutes: 10, attemptsAllowed: 3, status: "published" });
    }
  } catch (error) {
    if (course?._id) {
      await Promise.all([Quiz.deleteMany({ classId: course._id }), ClassLesson.deleteMany({ classId: course._id }), ClassModule.deleteMany({ classId: course._id }), Class.findByIdAndDelete(course._id)]).catch(() => null);
    }
    throw error;
  }
}

async function ensureAiftLearningCourses() {
  const locks = Class.db.collection("aift_seed_locks");
  const lockId = "aift-learning-courses-v1";
  const lockOwner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const lock = { _id: lockId, owner: lockOwner, expiresAt: new Date(now.getTime() + 5 * 60 * 1000) };

  try {
    await locks.insertOne(lock);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await locks.deleteOne({ _id: lockId, expiresAt: { $lte: now } });
    try {
      await locks.insertOne(lock);
    } catch (retryError) {
      if (retryError?.code === 11000) return;
      throw retryError;
    }
  }

  try {
  const provider = await User.findOne({ role: "admin", status: { $nin: ["suspended", "deactivated"] } }).select("_id").lean();
  if (!provider) {
    console.warn("AIFT LEARNING SEED: no active admin provider was found");
    return;
  }

  for (const definition of courses) {
    const matches = await Class.find({ "publishingSettings.slug": definition.slug }).sort({ createdAt: 1, _id: 1 }).select("_id").lean();
    const course = matches[0];
    for (const duplicate of matches.slice(1)) {
      await Promise.all([
        Quiz.deleteMany({ classId: duplicate._id }),
        ClassLesson.deleteMany({ classId: duplicate._id }),
        ClassModule.deleteMany({ classId: duplicate._id }),
        Class.findByIdAndDelete(duplicate._id)
      ]);
    }
    if (!course) {
      await createCourse(provider, definition);
      continue;
    }
    const coverUrl = `${FRONTEND}/${definition.cover}`;
    await Class.updateOne({ _id: course._id }, { $set: {
      coverImage: coverUrl,
      bannerImage: coverUrl,
      "appearanceSettings.thumbnailImage": coverUrl,
      "learningSettings.sequentialLessons": false,
      "learningSettings.allowLessonSkipping": true
    } });
  }
  } finally {
    await locks.deleteOne({ _id: lockId, owner: lockOwner }).catch(() => null);
  }
}

module.exports = { ensureAiftLearningCourses };
