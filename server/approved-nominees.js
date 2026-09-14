const groups = {
  general: {
    "Best Class of the Year": ["BSS - Level 300 (Geography Major)", "Chemistry Major - 350", "Economics/Geography - Level 350 (Geography Major)", "Maths/ Econs - Level 350", "Social Studies - Level 300", "Social Studies - 350"],
    "Best Friends of the Year": ["Boakye Comfort & Abdulai Osman", "Israel Banambo & Prince Stephen Sarpong", "Kingsley Asante & Shadrack Anane Gyasi", "Patience Badu & Bernice"],
    "Campus Icon of the Year": ["Donyina Twumasi Daniel", "Peter Fosu", "Sarpong Prince"],
    "Digital Content & Social Media Personality of the Year": ["Peter Fosu", "Sir Klement"],
    "Man of Our Time": ["Donyina Twumasi Daniel", "Yob Charles"],
    "Most Beautiful Student of the Year": ["Gifty Gyan", "Selassie Mohammed"],
    "Most Disciplined Student of the Year": ["Tiboah Aikins", "Yvonne Adigbli"],
    "Most Handsome Student of the Year": ["Prince Stephen", "Sadat Rockson"],
    "Most Photogenic Student of the Year": ["Asiedu Poku Felix", "Beatrice Nkrumah Dadzie", "Peter Fosu"],
    "Outstanding Student Leader of the Year": ["Awuley Clement", "Peter Fosu", "Wumbei Philip N-Moriba"],
    "SRC Personality of the Year": ["Awuley Clement", "Azango Julius"],
    "Sports Personality of the Year": ["Chantey Ezekiel", "Prince Otu Gidimadjor"],
    "Student Entrepreneur of the Year": ["Patience Badu", "Peter Fosu", "Richard Yao Adetsi"],
    "Student Humanitarian of the Year": ["Abubakari Ibrahim", "Peter Fosu"],
    "Woman of Our Time": ["Asana Adams", "Gifty Gyan", "Modester Amankwah"]
  },
  "level-300": {
    "Level 300 Best Course Rep of the Year": ["Abdulai Hamdu", "Appiah Stephen", "Daniloff Yeboah Odells", "Margaret Kwarteng Pokuaa"],
    "Level 300 Most Fashionable Female": ["Eric Froku Tetteh", "Margaret Kwarteng Pokuaa", "Sarah Boakye"],
    "Level 300 Most Fashionable Male": ["Awal Forkah Chieminah", "Eric Froku Tetteh", "Sampson Yobar Labik", "Samuel Tando"],
    "Level 300 Most Influential Student of the Year": ["Eric Froku Tetteh", "Opuku Godfred"],
    "Level 300 Most Popular Student of the Year": ["Godfred Opoku", "Kanchent Pakindam Confidence", "Oppong Kwaku Daniel", "Peter Fosu", "Sarah Agyakwah", "Tiboah Aikins"],
    "Level 300 Most Supportive Student of the Year": ["Anderson Amoakoadams", "Emmanuel Afful", "Peter Fosu", "Prince Stephen Sarpong"],
    "Level 300 Student Personality of the Year": ["Alhassah Mahawia", "Ansu Peprah Donald", "Arthur Gifty", "Fatimatu Nuhu"]
  },
  "level-350": {
    "Level 350 Best Course Rep of the Year": ["Gideon Korankye", "Gyeleyorteye Emmanuel", "John Botchway", "Kwesi Abraham", "Luke Ntim Yeboah"],
    "Level 350 Most Fashionable Female": ["Philomina Bemmah"],
    "Level 350 Most Fashionable Male": ["Appiah Boateng Emmanuel", "Ferguson George Yaw Amevor", "Mohammed Ishaw", "Sir Klement"],
    "Level 350 Most Influential Student of the Year": ["Donyina Twumasi Daniel", "Hamadu Sayaw", "Julius Azango"],
    "Level 350 Most Popular Student of the Year": ["Adjei Obeng Hanson", "Daniel Donyina Twumasi", "Emmanuel Kyei", "Hamadu Sayaw", "Kofi Alofi Bingrine", "Mohammed Ishaw", "Nkrumah Francis Yeboah"],
    "Level 350 Most Supportive Student of the Year": ["Abdul-Rasheed Ali Bawa", "Issahaku Abdul Kahad", "Prince Otu Gidimadjor", "Takyiwaa Oppong Salomey"],
    "Level 350 Student Personality of the Year": ["Azango Julius", "Donyina Twumasi Daniel", "Richard Yao Adetsi"]
  }
};

const approvedNominees = Object.entries(groups).flatMap(([group, categories]) => Object.entries(categories).flatMap(([category, names]) => names.map(name => ({ group, category, name, unclear: false }))));

module.exports = { approvedNominees };
