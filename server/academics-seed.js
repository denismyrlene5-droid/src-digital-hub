const course = (code, title, creditHours, remarks) => ({ code, title, creditHours, remarks });

const socialStudies = {
  1: [
    course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"),
    course("CMS 107SW", "Communicative Skills", 3, "Core"),
    course("ILT 101SW", "Information Literacy", 1, "Core"),
    course("EPS 101ASW", "Educational Psychology", 3, "Core"),
    course("SOC 101SW", "Introduction to Sociology", 3, "Core"),
    course("ECO 101SW", "Principles of Economics I", 3, "Core"),
    course("GEO 101S", "Elements of Physical Geography", 3, "Core"),
    course("GEO 103BS", "Thematic Geography of Ghana", 3, "Core")
  ],
  2: [
    course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"),
    course("EPS 211SW", "Educational Statistics", 3, "Core"),
    course("SOC111SW", "Introduction to Sociology II", 3, "Elective"),
    course("ESS213SW", "Curriculum Studies in Social Studies", 3, "Elective"),
    course("GEO102SW", "Elements of Human Geography", 3, "Elective"),
    course("GEO205SW", "Map Reading and Interpretation", 3, "Elective"),
    course("ECO102SW", "Principles of Economics II", 3, "Elective")
  ],
  3: [
    course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"),
    course("EPS 352SW", "Research Methods in Education", 3, "Core"),
    course("ESS 301SW", "Methods of Teaching Social Studies", 3, "Elective"),
    course("ESS 201SW", "Nature of History", 3, "Elective"),
    course("HIS 206SW", "Early West African Polities (AD1000-1500)", 3, "Elective"),
    course("ECO 201SW", "Elements of Economics I(Micro)", 3, "Elective"),
    course("GEO 302SW", "Climatology", 3, "Elective")
  ],
  4: [
    course("EPS 311SW", "Assessment in Education", 3, "Core"),
    course("EPS 499SW", "Project Work", 3, "Core"),
    course("ESS 304SW", "Meaning and Scope of Social Studies", 3, "Core"),
    course("GEO 212SW", "Geographic Thought", 3, "Core"),
    course("GEO 318SW", "Surveying and Cartography", 3, "Core"),
    course("ECO 202SW", "Element of Economics II (Macro)", 3, "Core"),
    course("ETP 499SW", "Educational Field Experience/Micro teaching", 3, "Core")
  ],
  5: [
    course("EDF 401S", "History and Management of Education in Ghana", 3, "Core"),
    course("EPS 403S", "Guidance and Counselling", 3, "Core"),
    course("ESS 402S", "Development of Social Studies in Ghana", 3, "Core"),
    course("ESS 404S", "Teaching Social Studies", 3, "Core"),
    course("GEO 408SW", "Population and Development", 3, "Core"),
    course("GEO 301SW", "Geomorphology and Oceanography", 3, "Core"),
    course("ECO 308SW", "Economy of Ghana", 3, "Core")
  ]
};

const socialSciences = {
  geography: {
    1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("EPS 101ASW", "Educational Psychology", 3, "Core"), course("GEO 101S", "Elements of Physical Geography", 3, "Elective"), course("GEO 103BS", "Thematic Geography of Ghana", 3, "Elective"), course("ECO 101SW", "Principles of Economics I", 3, "Elective")],
    2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("ESS215SW", "Curriculum Studies in Geography", 3, "Elective"), course("GEO205SW", "Map Reading and Interpretation", 3, "Elective"), course("GEO102SW", "Elements of Human Geography", 3, "Elective"), course("ECO102SW", "Principles of Economics II", 3, "Elective")],
    3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("ESS 311SW", "Methods of Teaching Geography", 3, "Elective"), course("ESS 210SW", "Nature of Geography", 3, "Elective"), course("GEO 331SW", "Regional Geography of West Africa", 3, "Elective"), course("GEO 302SW", "Climatology", 3, "Elective"), course("ECO 201SW", "Elements of Economics I(Micro)", 3, "Elective")],
    4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("GEO 301SW", "Geomorphology and Oceanography", 3, "Elective"), course("GEO 212SW", "Geographic Thought", 3, "Elective"), course("GEO 318SW", "Surveying and Cartography", 3, "Elective"), course("ECO 202SW", "Element of Economics II (Macro)", 3, "Elective"), course("ETP 499SW", "Educational Field Experience/Micro teaching", 3, "Core")],
    5: [course("EDF 401SW", "History and Management of Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("GEO 414SW", "Political Geography", 3, "Core"), course("GEO 443SW", "Agriculture Geography", 3, "Core"), course("GEO 408SW", "Population and Development", 3, "Core"), course("ECO 308SW", "Economy of Ghana", 3, "Core")]
  },
  economics: {
    1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("EPS 101ASW", "Educational Psychology", 3, "Core"), course("ECO 203SW", "Mathematics for Economist I", 3, "Elective"), course("ECO 101SW", "Principles of Economics I", 3, "Elective"), course("GEO 101S", "Elements of Physical Geography", 3, "Elective"), course("GEO 103BS", "Thematic Geography of Ghana", 3, "Elective")],
    2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("ESS216SW", "Curriculum Studies in Economics", 3, "Elective"), course("ECO204SW", "Mathematics for Economist II", 3, "Elective"), course("ECO102SW", "Principles of Economics II", 3, "Elective"), course("GEO205SW", "Map Reading and Interpretation", 3, "Elective"), course("GEO102SW", "Elements of Human Geography", 3, "Elective")],
    3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("ESS 331SW", "Methods of Teaching Economics", 3, "Elective"), course("ESS 206SW", "Nature of Economics", 3, "Elective"), course("ECO 303SW", "Intermediate Statistics I", 3, "Elective"), course("ECO 201SW", "Elements of Economics I(Micro)", 3, "Elective"), course("GEO 302SW", "Climatology", 3, "Elective")],
    4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("ECO 301SW", "Intermediate Microeconomics I", 3, "Elective"), course("ECO 304SW", "Intermediate Statistics II", 3, "Elective"), course("ECO 202SW", "Element of Economics II (Macro)", 3, "Elective"), course("GEO 301SW", "Geomorphology and Oceanography", 3, "Elective"), course("GEO 212SW", "Geographic Thought", 3, "Elective"), course("ETP 499SW", "Educational Field Experience/Micro teaching", 3, "Core")],
    5: [course("EDF 401SW", "History and Management of Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("ECO 302SW", "Intermediate Economics II", 3, "Core"), course("ECO 410SW", "Advance Economics", 3, "Core"), course("ECO 308SW", "Economy of Ghana", 3, "Core"), course("GEO 443SW", "Agriculture Geography", 3, "Core")]
  }
};

const mathematicsMajor = {
  1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("EPS 101ASW", "Educational Psychology", 3, "Core"), course("EMA 201SW", "Nature of Mathematics", 3, "Elective_Major"), course("MAT 210SW", "Introduction to Abstract Algebra*", 3, "Elective_Major"), course("EMA 111SW", "Developing Algebraic Thinking", 3, "Elective_Major")],
  2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("EMA 211SW", "Curriculum Studies in Mathematics Education", 3, "Core"), course("EMA 112SW", "Teaching and Learning Calculus for Conceptual Understanding", 2, "Core"), course("EMA 203SW", "Psychological Basis of Teaching and Learning Mathematics", 3, "Elective_Major"), course("MAT 204SW", "Introduction to Statistics and Probability", 3, "Elective_Major")],
  3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("EMA 208SW", "Methods of Teaching High School Mathematics", 3, "Elective_Major"), course("EMA 212SW", "Pedagogical Content Knowledge in Mathematics", 2, "Elective_Major"), course("MAT 202SW", "Vector Algebra and Differential Equations", 3, "Elective_Major"), course("MAT 203SW", "Further Calculus", 3, "Elective_Major")],
  4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("EMA321SW", "Developing Pedagogical Content Knowledge in Mechanics", 3, "Elective_Major"), course("EMA 335SW", "Development of Instructional Materials in Mathematics", 3, "Elective_Major"), course("MAT 301SW", "Advanced Calculus I", 3, "Elective_Major"), course("ETP 499SW", "Educational Field Experience / Micro teaching", 3, "Elective_Major")],
  5: [course("EDF 401SW", "History and Management Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("EMA 406SW", "Advanced study of basic School Mathematics", 2, "Elective_Major"), course("EMA 402SW", "Teaching Problem Solving in Mathematics", 3, "Elective_Major"), course("EMA 312SW", "Secondary School Mathematics Curriculum", 2, "Elective_Major"), course("MAT 405SW", "Ordinary Differential Equations", 3, "Elective_Major"), course("MAT 302SW", "Advanced Calculus II", 3, "Elective_Major")]
};

const mathematicsMinors = {
  Chemistry: {
    1: [course("CHE 101SW", "Basic General Chemistry", 2, "Elective"), course("CHE 103SW", "Basic Inorganic Chemistry", 1, "Elective")],
    2: [course("CHE 102SW", "Basic Organic Chemistry*", 2, "Elective"), course("CHE 104SW", "Introductory Practical Organic Chemistry*", 1, "Elective")],
    3: [course("CHE 203SW", "Physical Chemistry", 2, "Elective"), course("CHE 207SW", "Practical Physical / Inorganic Chemistry I", 1, "Elective")],
    4: [course("CHE 204SW", "Organic Chemistry II (Theory)", 2, "Elective"), course("CHE 216SW", "Practical Organic Chemistry", 1, "Elective")],
    5: [course("CHE 208SW", "Physical Chemistry II", 3, "Elective"), course("CHE 310SW", "Practical (Physical/Inorganic) Chemistry II", 2, "Elective")]
  },
  Economics: { 1: [course("ECO 101SW", "Principles of Economics I", 3, "Elective")], 2: [course("ECO 102SW", "Principles of Economics II*", 3, "Elective")], 3: [course("ECO 201SW", "Elements of Economics I", 3, "Elective")], 4: [course("ECO 202SW", "Elements of Economics II (Macro)", 3, "Elective")], 5: [course("ECO 308SW", "Economy of Ghana", 3, "Elective")] },
  Physics: { 1: [course("PHY 101SW", "Basic General Physics 1 [Theory]", 2, "Elective"), course("PHY 101SW", "Basic General Physics 1 [Practical]", 1, "Elective")], 2: [course("PHY 102SW", "General Physics II (Theory)*", 2, "Elective"), course("PHY 104SW", "General Physics II(Practical)*", 1, "Elective")], 3: [course("PHY 301SW", "Classical Mechanics", 3, "Elective")], 4: [course("PHY 402SW", "Physics Optics", 3, "Elective")], 5: [course("PHY 403SW", "Solid State Physics", 3, "Elective")] }
};

const scienceMajor = {
  Biology: {
    1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("ESC 203SW", "Psychological Basis of Science Education", 3, "Core"), course("BIO 102SW", "Basic Cytology and Genetics", 3, "Elective_Major"), course("BIO 101SW", "Diversity of Living Organism*", 3, "Elective_Major")],
    2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("ESC 214SW", "Curriculum Studies in Biology", 3, "Elective_Major"), course("BIO 212SW", "Mammalian Anatomy and Physiology", 3, "Elective_Major"), course("BIO 211SW", "Plant Physiology*", 3, "Elective_Major")],
    3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("ESC 201SW", "Nature of Science", 3, "Elective_Major"), course("ESC 208SW", "Methods of Teaching Biology", 3, "Elective_Major"), course("BIO 308SW", "Habitat Ecology", 3, "Elective_Major"), course("BIO 201SW", "Basic Soil Science*", 3, "Elective_Major")],
    4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("ESC 335SW", "Development of Science Teaching Materials", 3, "Elective_Major"), course("BIO 202SW", "Cell and Tissue Organization", 3, "Elective_Major"), course("BIO 204SW", "Morphology and Anatomy of Vascular Plants*", 3, "Elective_Major"), course("ETP 499SW", "Educational Field Experience / Micro teaching", 3, "Core")],
    5: [course("EDF 401SW", "History and Management Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("ESC 330SW", "Developing Pedagogical Content Knowledge in Biology", 3, "Elective_Major"), course("BIO 208SW", "Population Genetics and Evolution*", 3, "Elective_Major"), course("BIO 309SW", "Introduction to Molecular Genetics", 3, "Elective_Major")]
  },
  Chemistry: {
    1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("ESC 203SW", "Psychological Basis of Science Education", 3, "Core"), course("CHE 102SW", "Basic Organic Chemistry", 2, "Elective_Major"), course("CHE 104SW", "Introductory Practical Organic Chemistry", 1, "Elective_Major"), course("CHE 101SW", "Basic General Chemistry*", 2, "Elective_Major"), course("CHE 103SW", "Basic Inorganic Chemistry*", 1, "Elective_Major")],
    2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("ESC 216SW", "Curriculum Studies in Chemistry", 3, "Elective_Major"), course("CHE 201SW", "Main Group Chemistry", 2, "Elective_Major"), course("CHE 207SW", "Practical (Physical/Inorganic Chemistry)", 1, ""), course("CHE 102SW", "Basic Organic Chemistry*", 2, "Elective_Major"), course("CHE 104SW", "Introductory Practical Organic Chemistry*", 1, "Elective_Major")],
    3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("ESC 201SW", "Nature of Science", 3, "Elective_Major"), course("ESC 209SW", "Methods of Teaching Chemistry", 3, "Elective_Major"), course("CHE 204SW", "Organic Chemistry II*", 2, "Elective_Major"), course("CHE 216SW", "Practical Organic Chemistry*", 1, "Elective_Major"), course("CHE 208SW", "Physical Chemistry II", 3, "Elective_Major"), course("CHE 203SW", "Physical Chemistry", 3, "Elective_Major"), course("CHE 207SW", "Practical Inorganic Chemistry II", 1, "Elective_Major")],
    4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("ESC 335SW", "Development of Science Teaching Materials", 3, "Elective_Major"), course("CHE 301SW", "Analytical Chemistry", 3, "Elective_Major"), course("CHE 319SW", "Practical Organic Chemistry", 2, "Elective_Major"), course("CHE 303SW", "Thermodynamics", 2, ""), course("ETP 499SW", "Educational Field Experience / Micro teaching", 3, "Elective_Major")],
    5: [course("EDF 401SW", "History and Management Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("ESC 332SW", "Developing Pedagogical Content Knowledge in Chemistry", 3, "Elective_Major"), course("CHE 425BSW", "Aromatic & Heterocyclic Chemistry", 3, "Elective_Major"), course("CHE 427BSW", "Electrochemistry", 3, "Elective_Major")]
  },
  Physics: {
    1: [course("EDF 102SW", "Social and Philosophical Foundation of Education", 3, "Core"), course("CMS 107SW", "Communicative Skills", 3, "Core"), course("ILT 101SW", "Information Literacy", 1, "Core"), course("ESC 203SW", "Psychological Basis of Science Education", 3, "Core"), course("PHY 102SW", "General Physics II (Theory)", 2, "Elective_Major"), course("PHY 104SW", "General Physics II (practical)", 1, "Elective_Major"), course("PHY 101SW", "Basic General Physics 1 [Theory]", 2, "Elective_Major"), course("PHY 101SW", "Basic General Physics 1 [Practical]", 1, "Elective_Major")],
    2: [course("ASP 140SW", "Africa in the Unipolar World", 3, "Core"), course("EPS 211SW", "Educational Statistics", 3, "Core"), course("PHY 202SW", "Electricity and Magnetism (Theory)", 2, "Elective_Major"), course("PHY 206SW", "Electricity and Magnetism (Practical)", 1, "Elective_Major"), course("PHY 203SW", "Introductory Atomic Physics, Heat, Optics (Theory)", 2, "Elective_Major"), course("PHY 207SW", "Introductory Atomic Physics, Heat, Optics (Practical)", 1, "Elective_Major")],
    3: [course("PHL 205SW", "Critical Thinking and Practical Reasoning", 3, "Core"), course("EPS 352SW", "Research Methods in Education", 3, "Core"), course("ESC 201SW", "Nature of Science", 3, "Elective_Major"), course("ESC 210SW", "Methods of Teaching Physics", 3, "Elective_Major"), course("PHY 301SW", "Classical Mechanics", 3, "Elective_Major"), course("PHY 302SW", "Special Theory of Relativity", 3, "Elective_Major")],
    4: [course("EPS 311SW", "Assessment in Education", 3, "Core"), course("EPS 499SW", "Project Work", 3, "Core"), course("ESC 335SW", "Development of Science Teaching Materials", 3, "Elective_Major"), course("PHY 401SW", "Introduction to Mathematical Methods", 3, "Elective_Major"), course("PHY 402SW", "Physics Optics", 3, "Elective_Major"), course("ETP 499SW", "Educational Field Experience / Micro teaching", 3, "Core")],
    5: [course("EDF 401SW", "History and Management Education in Ghana", 3, "Core"), course("EPS 403SW", "Guidance and Counselling", 3, "Core"), course("ESC 334SW", "Developing Pedagogical Content Knowledge in Physics", 3, "Elective_Major"), course("PHY 404SW", "Quantum Mechanics", 3, "Elective_Major"), course("PHY 403SW", "Solid State Physics*", 3, "Elective_Major")]
  }
};

const scienceMinors = {
  Biology: { 1: [course("BIO 101SW", "Diversity of Living Organism", 3, "Elective")], 2: [course("BIO 211SW", "Plant Physiology*", 3, "Elective")], 3: [course("BIO 201SW", "Basic Soil Science*", 3, "Elective")], 4: [course("BIO 204SW", "Morphology and Anatomy of Vascular Plants*", 3, "Elective")], 5: [course("BIO 208SW", "Population Genetics and Evolution*", 3, "Elective")] },
  Chemistry: {
    1: [course("CHE 101SW", "Basic General Chemistry", 2, "Elective"), course("CHE 103SW", "Basic Inorganic Chemistry", 1, "Elective")],
    2: [course("CHE 102SW", "Basic Organic Chemistry*", 2, "Elective"), course("CHE 104SW", "Introductory Practical Organic Chemistry*", 1, "Elective")],
    3: [course("CHE 203SW", "Physical Chemistry", 2, "Elective"), course("CHE 207SW", "Practical Physical / Inorganic Chemistry I", 1, "Elective")],
    4: [course("CHE 204SW", "Organic Chemistry II (Theory)", 2, "Elective"), course("CHE 216SW", "Practical Organic Chemistry", 1, "Elective")],
    5: [course("CHE 208SW", "Physical Chemistry II", 3, "Elective"), course("CHE 310SW", "Practical (Physical/Inorganic) Chemistry II", 2, "Elective")]
  },
  Mathematics: { 1: [course("MAT 210SW", "Introduction to Abstract Algebra*", 3, "Elective")], 2: [course("MAT 102SW", "Analytical Geometry and Calculus*", 3, "Elective")], 3: [course("MAT 202SW", "Vector Algebra and Differential Equations*", 3, "Elective")], 4: [course("MAT 203SW", "Further Calculus", 3, "Elective")], 5: [course("MAT 301SW", "Advanced Calculus I*", 3, "Elective")] },
  Physics: { 1: [course("PHY 101SW", "Basic General Physics 1 [Theory]", 2, "Elective"), course("PHY 101SW", "Basic General Physics 1 [Practical]", 1, "Elective")], 2: [course("PHY 102SW", "General Physics II(Theory)*", 2, "Elective"), course("PHY 104SW", "General Physics II (practical)*", 1, "Elective")], 3: [course("PHY 301SW", "Classical Mechanics*", 3, "Elective")], 4: [course("PHY 402SW", "Physics Optics", 3, "Elective")], 5: [course("PHY 403SW", "Solid State Physics*", 3, "Elective")] }
};

function withMinor(majorRows, minorRows) {
  return Object.fromEntries([1, 2, 3, 4, 5].map(semester => [semester, [...majorRows[semester], ...minorRows[semester]]]));
}

const programmes = [
  { name: "SOCIAL STUDIES", major: null, minor: null, semesters: socialStudies },
  { name: "SOCIAL SCIENCES", major: "GEOGRAPHY", minor: "ECONOMICS", semesters: socialSciences.geography },
  { name: "SOCIAL SCIENCES", major: "ECONOMICS", minor: "GEOGRAPHY", semesters: socialSciences.economics },
  ...["Chemistry", "Economics", "Physics"].map(minor => ({ name: "B.ED. MATHEMATICS", major: "MATHEMATICS", minor: minor.toUpperCase(), semesters: withMinor(mathematicsMajor, mathematicsMinors[minor]) })),
  { name: "B.ED. SCIENCE", major: "BIOLOGY", minor: "CHEMISTRY", semesters: withMinor(scienceMajor.Biology, scienceMinors.Chemistry) },
  ...["Biology", "Mathematics", "Physics"].map(minor => ({ name: "B.ED. SCIENCE", major: "CHEMISTRY", minor: minor.toUpperCase(), semesters: withMinor(scienceMajor.Chemistry, scienceMinors[minor]) })),
  ...["Chemistry", "Mathematics"].map(minor => ({ name: "B.ED. SCIENCE", major: "PHYSICS", minor: minor.toUpperCase(), semesters: withMinor(scienceMajor.Physics, scienceMinors[minor]) }))
];

module.exports = {
  title: "INSTITUTE OF EDUCATION B.ED. 5-SEMESTER PROGRAMMES AND STRUCTURES",
  versionName: "Official UCC 5-Semester Structure",
  sourceName: "5_Semester_Course Structure_composite.pdf",
  sourceNotes: "Imported from the supplied 14-page official UCC Institute of Education document. Page 12 includes a repeated PHY 301SW row among minor options that does not correspond to the declared Chemistry or Mathematics minors. Page 14 contains a blank row 6 marked Elective_Major. No course was invented for either source anomaly.",
  programmes
};
