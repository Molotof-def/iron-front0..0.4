export type Rarity='Обычная'|'Редкая'|'Эпическая'|'Легендарная';
export interface Tank {id:string;name:string;country:string;class:string;rarity:Rarity;level:number;hp:number;attack:number;armor:number;speed:number;cost:number;description:string;history:string;shape:number;owned:boolean}
export interface Building {id:string;name:string;level:number;cost:number;effect:string;description:string}
export interface SaveData {version:number;credits:number;steel:number;science:number;xp:number;level:number;activeTank:string;tanks:Record<string,{owned:boolean;level:number}>;buildings:Record<string,number>;research:string[];wins:number;losses:number;battles:number;missions:Record<string,number>;achievements:string[];nickname:string;tutorialDone:boolean;history:string[]}
