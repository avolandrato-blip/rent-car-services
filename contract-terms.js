(function (root) {
  const DISTANCE_TERMS = {
    '0_30': {
      label: '0–30 km',
      limit: '30 km maximum',
      minimumLabel: 'Formules 12 h ou 24 h',
      surcharge: 'Le trajet aller contractuel est limité à 30 km. En cas de dépassement, les kilomètres effectués au-delà de 30 km sont majorés de 1 000 Ariary par kilomètre. La distance est comptée sur le trajet aller uniquement; le retour n’est pas ajouté une seconde fois au calcul du palier.'
    },
    '30_100': {
      label: '30–100 km',
      limit: '100 km maximum',
      minimumLabel: 'Minimum 2 jours',
      surcharge: 'Le trajet aller contractuel est limité à 100 km. En cas de dépassement, les kilomètres effectués au-delà de 100 km sont majorés de 1 000 Ariary par kilomètre. La distance est comptée sur le trajet aller uniquement; le retour n’est pas ajouté une seconde fois au calcul du palier.'
    },
    '100_200': {
      label: '100–200 km',
      limit: '200 km maximum',
      minimumLabel: 'Minimum 3 jours',
      surcharge: 'Le trajet aller contractuel est limité à 200 km. En cas de dépassement, les kilomètres effectués au-delà de 200 km sont majorés de 1 000 Ariary par kilomètre. La distance est comptée sur le trajet aller uniquement; le retour n’est pas ajouté une seconde fois au calcul du palier.'
    },
    'over_200': {
      label: 'Plus de 200 km — palier ouvert',
      limit: 'Palier ouvert, sans plafond supérieur',
      minimumLabel: 'Minimum 5 jours',
      surcharge: 'Le palier supérieur à 200 km est ouvert et ne comporte pas de plafond supérieur. Il n’existe donc pas de seuil kilométrique supplémentaire au-delà duquel la majoration de dépassement serait calculée. La distance de référence reste le trajet aller contractuel.'
    }
  };

  function getDistanceTerms(band) {
    const selected = DISTANCE_TERMS[band];
    return selected
      ? { band, ...selected }
      : { band: null, label: 'Palier non renseigné', limit: 'À confirmer par écrit', minimumLabel: 'À confirmer', surcharge: 'Le palier et toute majoration kilométrique doivent être confirmés par écrit avant la remise du véhicule.' };
  }

  function buildContractTerms(withDriver, distanceBand) {
    const distance = getDistanceTerms(distanceBand);
    const articles = [
      ['Article 2 : Conditions du locataire', withDriver ? 'Le locataire doit présenter une pièce d’identité valide et les justificatifs demandés pour la réservation. Le véhicule est conduit par le chauffeur mis à disposition par le loueur; le locataire n’est pas autorisé à le conduire, sauf accord écrit préalable.' : 'Le locataire doit être âgé d’au moins 21 ans et détenir un permis valide depuis au moins 2 ans. Il doit présenter une pièce d’identité et une copie du permis de conduire. Il doit être solvable, assuré et conducteur déclaré par écrit dans le présent contrat.'],
      ['Article 3 : Zone, palier kilométrique et conditions d’utilisation', `${distance.label} — ${distance.limit}. ${distance.surcharge} La distance du trajet aller est appréciée pour le trajet et la destination indiqués à l’article 1, selon le compteur kilométrique ou le GPS. Tout changement de destination ou sortie de la zone convenue requiert l’accord écrit préalable du loueur. Le locataire doit respecter le code de la route et utiliser le véhicule avec soin. Il est interdit de l’utiliser pour une activité commerciale ou professionnelle rémunérée, notamment comme taxi ou pour le transport via InDrive, sauf autorisation écrite préalable. Sont également interdits le transport illégal, les courses, le transport de marchandises dangereuses, la surcharge et les routes incompatibles avec le véhicule.`],
      ['Article 4 : Prêt, sous-location, vente et fraude', 'Le véhicule reste la propriété exclusive du loueur. Il est interdit de le prêter, céder, louer, re-louer, sous-louer, vendre, tenter de vendre, mettre en gage, publier une annonce à son sujet ou percevoir un paiement pour sa remise à un tiers. Le locataire garantit l’exactitude et l’authenticité de son identité, de son permis et des documents remis. Toute fausse identité, faux document, document falsifié, dissimulation du conducteur, fausse signature, fausse déclaration ou manœuvre frauduleuse peut entraîner la reprise immédiate du véhicule, la résiliation du contrat et le dépôt d’une plainte auprès des autorités compétentes. Les préjudices et frais directement causés peuvent être réclamés sur justificatifs.'],
      ['Article 5 : État, carburant et restitution', 'Un état des lieux indiquant le kilométrage, le carburant, l’état du véhicule, les équipements, accessoires et clés est réalisé avant la remise et après la restitution ou la reprise. Des photographies ou vidéos datées peuvent être réalisées et transmises. Le véhicule doit être rendu à la date et à l’heure convenues, avec le même niveau de carburant et les mêmes équipements. Le carburant manquant est facturé selon la quantité consommée, avec 20 000 Ariary de frais de service. En cas de retard : jusqu’à 1 heure, 10 000 Ariary ; de plus d’1 heure à 3 heures, 25 000 Ariary par heure entamée ; au-delà de 3 heures, une journée supplémentaire.'],
      ['Article 6 : Accident, panne, casse et frais', 'En cas d’accident, panne, casse, incendie, incident ou immobilisation, le locataire doit assurer la sécurité, informer immédiatement le loueur, communiquer le lieu, prendre des photos si possible, suivre ses instructions et faire les démarches nécessaires. Aucune réparation, modification ou remorquage ne peut être engagé sans l’accord du loueur, sauf urgence de sécurité. Lorsque le dommage résulte d’une faute, négligence, mauvaise utilisation, sortie non autorisée de la zone ou autre manquement du locataire, les frais directement liés sont à sa charge : pièces, main-d’œuvre, diagnostic, déplacement, remorquage, récupération, transport, gardiennage, immobilisation et démarches. Ces frais sont justifiés par devis, factures, reçus ou autres pièces disponibles. Les frais de fourrière, amendes, retrait de documents ou immobilisation liés au locataire sont également à sa charge. Cette clause ne s’applique pas automatiquement à une panne mécanique indépendante du comportement du locataire.'],
      ['Article 7 : Vol, clés et non-restitution', 'En cas de vol, disparition ou non-restitution, le locataire doit informer immédiatement le loueur, contacter les autorités, déposer plainte, transmettre le récépissé et remettre les clés, documents et accessoires encore en sa possession. La perte, le vol ou la détérioration des clés, ainsi que les frais de remplacement ou de réparation, peuvent être facturés sur justificatifs. La dissimulation, la remise à un tiers, la vente ou la mise en gage du véhicule peuvent entraîner une plainte et une demande de réparation.'],
      ['Article 8 : Vérification et reprise du véhicule', 'Pendant toute la location, le loueur peut vérifier à tout moment, sans préavis, l’état, la localisation, le kilométrage et les conditions d’utilisation du véhicule. Sauf urgence, la vérification est effectuée dans un lieu accessible et à des horaires raisonnables ; elle ne permet pas d’entrer au domicile du locataire. Le loueur peut reprendre le véhicule à tout moment et sans préavis en cas de vente, re-location, sous-location, remise à un tiers, fraude, usage de faux, non-paiement, refus de vérification ou de restitution, utilisation interdite, sortie non autorisée de la zone, accident, immobilisation, disparition ou risque sérieux de perte. Un état des lieux de reprise est établi dans la mesure du possible.'],
      ['Article 9 : Remboursement en cas de retrait anticipé', 'Si le retrait n’est pas imputable au locataire, le prix payé pour la période restant à courir est remboursé au prorata des jours ou heures non utilisés. Les périodes commencées et les frais de livraison, récupération ou prestations déjà exécutées ne sont pas remboursés. Le remboursement est effectué entre le 20 et le 30 du mois suivant le retrait. Aucun remboursement des jours restants n’est dû lorsque le retrait est causé par un manquement du locataire, sans préjudice des sommes, dommages et frais réclamables.'],
      ['Article 10 : Responsabilité financière et règlement', 'Aucune caution n’est demandée, mais le locataire reste responsable des dommages, pertes, retards, amendes, fourrière, carburant, clés, accessoires et autres frais qui lui sont directement imputables. Le loueur communique le détail et les justificatifs disponibles. Le locataire peut présenter ses observations dans le jour suivant le décompte. Les sommes certaines, exigibles et non contestées sont payables dans les 10 jours.'],
      ['Article 11 : Acceptation', 'Le locataire reconnaît avoir lu, compris et accepté les conditions du présent contrat, notamment celles relatives au palier kilométrique, aux usages interdits, à la vente, à la sous-location, à la fraude, à la vérification, à la reprise et au remboursement.']
    ];
    if (withDriver) articles.push(['Article 12 : Conditions particulières de la location avec chauffeur', 'Le véhicule est conduit par le chauffeur mis à disposition par le loueur. Le client convient avec le loueur de l’itinéraire et des horaires. Toute modification de l’itinéraire ou des horaires doit être préalablement validée par le loueur. Les repas et l’hébergement du chauffeur sont à la charge du client, sauf accord contraire écrit.']);
    return articles.map(([title, text]) => `<h2>${title}</h2><p>${text}</p>`).join('');
  }

  const api = { buildContractTerms, getDistanceTerms };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RentCarContractTerms = api;
})(typeof window !== 'undefined' ? window : globalThis);
