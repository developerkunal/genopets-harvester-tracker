import React, { useReducer, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from "@metaplex-foundation/js";
import { Program } from '@project-serum/anchor';
import { Container, Row, Col, Form, Button, Table } from 'react-bootstrap';
import idl from './genopets_idl';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios'
const connection = new Connection('https://rpc.ankr.com/solana/');
const metaplex = Metaplex.make(connection);
const programId = new PublicKey('HAbiTatJVqoCJd9asyr6RxMEdwtfrQugwp7VAFyKWb1g');

// Anchor programs have the `account` property which includes all the accounts from the IDL
// in a `camelCase` format. Since these are models, they're mapped here in `PascalCase` to
// distinguish them easily through the code
const { account: { habitatData: HabitatData, lockedKi: LockedKi, playerData: PlayerData } } = new Program(idl, programId, { connection });
function convert(str) {
  var current = new Date(str);
    


  return current.toLocaleString();
}
const formReducer = (state, { name, value }) => ({
  ...state,
  [name]: value,
});

function App() {
  const [formData, setFormData] = useReducer(formReducer, {});
  const [searching, setSearching] = useState(false);
  const [pendingHarvests, setPendingHarvests] = useState([]);
  const [tenants, setTenants] = useState({});
  const [habitats, setHabitats] = useState({});
  const [filteredData,setFilteredData] = useState([]);

  const handleSumbit = async (event) => {
    event.preventDefault();

    try {
      const landlordKey = new PublicKey(formData.landlord);

      setSearching(true);
      setPendingHarvests([]);
      setTenants({});
      setHabitats({});

      // Fetch all NFTs owned
      const nfts = await metaplex.nfts().findAllByOwner({ owner: landlordKey }).run();
      // Dictionary to map NFTs to their mint address
      const habitats = {};
      // Game data derived keys
      const habitatKeys = [];
      const habitatsids = [];
      for (const nft of nfts) {
        if (nft.symbol === 'HABITAT') {
          habitats[nft.mintAddress.toBase58()] = nft;
          habitatsids.push(nft.mintAddress.toBase58());
          habitatKeys.push(PublicKey.findProgramAddressSync(["habitat-data", nft.mintAddress.toBuffer()], programId)[0]);
        }
      }
      // Fetch game data for the habitats
      
      const habitatDatas = await HabitatData.fetchMultiple(habitatKeys);
      async function fetchHabitatData (id){
        const data = await axios.get(`https://api.genopets.me/habitat/${id}`);
        return data.data;
      }
      const habitatdataA = [];
      for (const habitatsid of habitatsids ){
        const data = await fetchHabitatData(habitatsid);
        console.log(data,habitatsid)
        habitatdataA.push(data);
      }
      setHabitats(habitatdataA);
      //setHabitats(habitatdataA);
      // Add resulting data to habitats dictionary
      for (const habitatData of habitatDatas) {
        habitatData.sequence = habitatData.sequence.toNumber();
        habitats[habitatData.habitatMint.toBase58()].habitatData = habitatData;
      }

      // Fetch all locked KI entries for the landlord
      const lockedKiEntries = await LockedKi.all([
        { dataSize: 1040 },
        { memcmp: { offset: 110, bytes: formData.landlord } },
      ]);

      const pendingHarvests = [];
      const tenants = {};
      const tenantPlayerDataKeys = [];

      // Map to user-friendly data
      for (const { publicKey, account } of lockedKiEntries) {
        const player = account.player.toBase58();
        const landlord = account.landlord.toBase58();
        const amount = account.amount.toNumber() / 10**9;
        const startTime = new Date(account.startTimestamp.toNumber() * 1000);
        const royaltyRate = account.royaltyRateBips / 10000;
        const habitatKey = account.habitat.toBase58();

        let habitat = habitatKey.substring(0, 8) + '...';
        if (habitats[habitatKey]) {
          habitat = habitats[habitatKey].name;
        }

        let harvesterKi = 0;
        let landlordKi = 0;

        if (player === landlord) {
          landlordKi = amount;
        } else {
          if (!tenants[player]) {
            tenants[player] = {
              pendingKi: 0,
              lastHarvest: startTime,
            };

            tenantPlayerDataKeys.push(PublicKey.findProgramAddressSync(["player-data", account.player.toBuffer()], programId)[0]);
          }

          harvesterKi = amount * (1 - royaltyRate);
          landlordKi = amount * royaltyRate;

          tenants[player].pendingKi += harvesterKi;
          if (tenants[player].lastHarvest < startTime) {
            tenants[player].lastHarvest = startTime;
          }
        }

        pendingHarvests.push({
          id: publicKey.toBase58(),
          player,
          startTime,
          endTime: new Date(account.endTimestamp.toNumber() * 1000),
          amount,
          harvesterKi,
          landlordKi,
          habitat,
        });
      }

      pendingHarvests.sort((a, b) => a.endTime > b.endTime ? 1 : b.endTime > a.endTime ? -1 : 0);

      // Fetch player data of the tenants
      const playerDataEntries = await PlayerData.fetchMultiple(tenantPlayerDataKeys);
      
      for (const { player, active, banned, lastHarvestTimestamp ,activeHabitat} of playerDataEntries) {
       let activehabitats2=  HabitatData.fetch([activeHabitat]);
        Object.assign(tenants[player.toBase58()], {
          active,
          banned,
          lastHarvest2: new Date(lastHarvestTimestamp.toNumber() * 1000),
          activeHabitat: activeHabitat.toString()
        });
      }

      setPendingHarvests(pendingHarvests);
      setTenants(tenants);
     // setHabitats(habitats);
      setFilteredData(pendingHarvests);
    } catch(e) {
      alert(e);
    } finally {
      setSearching(false);
    }
  };
  const handleSearch = (event) => {
    let value = event.target.value;
    let result = [];
    result = pendingHarvests.filter((data) => {
    return data.player.search(value) != -1;
    });
    setFilteredData(result);
    }
  const handleChange = ({ target: { name, value }}) => {
    setFormData({ name, value });
  };
  const humanDate = date => date.toISOString().substring(0, 16).replace('T', ' ') + ' UTC';

  return (
    <Container>
      <h1>Genopets harvests tracker</h1>
      <Form onSubmit={handleSumbit}>
        <Form.Group className='row'>
          <Form.Label className='col-sm-2 col-form-label'>Landlord wallet</Form.Label>
          <Col className='col-sm-4'>
            <Form.Control type='text' name='landlord' onChange={handleChange}></Form.Control>
          </Col>
          <Col className='col-sm-6'>
            <Button variant='primary' type='submit'>Search</Button>
          </Col>
        </Form.Group>
      </Form>
      {searching && <div>Fetching harvests</div>}
      <Row>
        <Col>
          <h2>Habitats</h2>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Level</th>
                <th>Element</th>
                <th>(end of lifespan)</th>
                <th>Harvester</th>
                <th>Royalty</th>
                <th>Total KI harvested</th>
                <th>Durability</th>
                <th>Habitats terraformed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(habitats).sort(([, a], [, b]) => a.attributes[1].value > b.attributes[1].value ? 1 : a.attributes[1].value < b.attributes[1].value ? -1 : 0).map(([id, { name, attributes }], i) => (
                <tr key={ id }>
                  <td>{ i + 1 }</td>
                  <td>{ name }</td>
                  <td>{ attributes.find(attr => attr.trait_type === "Level").value }</td>
                  <td>{ attributes.find(attr => attr.trait_type === "Element").value }</td>
                  <td>{attributes.find(attr => attr.trait_type === "Lifespan").value }</td>
                  <td>{attributes.find(attr => attr.trait_type === "Harvester") ? attributes.find(attr => attr.trait_type === "Harvester").value : "no harvester found"}</td>
                  <td>{ attributes.find(attr => attr.trait_type === "Royalty").value}</td>
                  <td>{ attributes.find(attr => attr.trait_type === "Total Ki Earned").value }</td>
                  <td>{attributes.find(attr => attr.trait_type === "Durability").value }</td>
                  <td>{ attributes.find(attr => attr.trait_type === "Seeds Spawned").value }</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
      <Row>
        <Col>
          <h2>Tenants</h2>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Pending KI</th>
                <th>Banned</th>
                <th>Active</th>
                <th>Last harvest for selected landlord</th>
                <th>Last harvest</th>
                <th>Address Habitat</th>
              </tr>
            </thead>
            <tbody> 
              {Object.entries(tenants).map(([id, data], i) => (
                <tr key={ id }>
                  <td>{ i + 1 }</td>
                  <td>{ id}</td>
                  <td>{ parseFloat(data.pendingKi.toFixed(2)) }</td>
                  <td>{ data.banned ? 'Yes' : 'No' }</td>
                  <td>{ data.active ? 'Yes' : 'No' }</td>
                  <td>{ convert(data.lastHarvest).toString() } </td>
                  <td>{ convert(data.lastHarvest2).toString() } </td>
                  <td>{data.activeHabitat}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
      <Row>
        <Col>
        <label>Search:</label>
        <input type="text" onChange={(event) =>handleSearch(event)} />  
          <h2>Pending harvests</h2>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>KI amount</th>
                <th>Harvester's KI</th>
                <th>Landlord's KI</th>
                <th>Habitat</th>
                <th>Harvest date</th>
                <th>Claim date</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(({ id, player, startTime, endTime, amount, harvesterKi, landlordKi, habitat }, i) => (
                <tr key={ id }>
                  <td>{ i + 1 }</td>
                  <td>{ player}</td>
                  <td>{ parseFloat(amount.toFixed(2)) }</td>
                  <td>{ parseFloat(harvesterKi.toFixed(2)) }</td>
                  <td>{ parseFloat(landlordKi.toFixed(2)) }</td>
                  <td>{ habitat }</td>
                  <td>{ convert(startTime).toString()}</td>
                  <td>{ convert(endTime).toString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>Pending landlord KI</th>
                <th>{parseFloat(filteredData.reduce((agg, { landlordKi }) => agg + landlordKi, 0).toFixed(2))}</th>
                <th colSpan={3}>&nbsp;</th>
              </tr>
            </tfoot>
          </Table>
        </Col>
      </Row>
    </Container>
  );
}

export default App;
