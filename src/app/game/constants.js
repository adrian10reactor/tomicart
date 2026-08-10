export const LANES = [-2.4, 0, 2.4];
export const TIE_SPACING = 2.5;
export const TRAIN_HEAD_URL = "/train-head.png";
export const CAMERA_Z = 13;

export const OBSTACLE_KINDS = {
  person1: { label: "Person 1", defaultSpan: "lane" },
  person2: { label: "Person 2", defaultSpan: "lane" },
  person3: { label: "Person 3", defaultSpan: "lane" },
  personboss: { label: "The Boss", defaultSpan: "lane" },
  log: { label: "Fallen log", defaultSpan: "all" },
};

export const OBSTACLE_KIND_LIST = Object.keys(OBSTACLE_KINDS);
